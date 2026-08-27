//! Local HTTP media server for WebView-safe playback.
//!
//! WebKitGTK frequently freezes on `asset://` / `convertFileSrc` audio.
//! Serving compact MP3 previews over `http://127.0.0.1` with Range support
//! keeps Play/Seek responsive.
//!
//! Requests must include the per-session media token (query or header).

use crate::error::AppError;
use axum::extract::{Query, Request, State};
use axum::http::{HeaderMap, Method, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::Router;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use uuid::Uuid;

#[derive(Clone)]
struct MediaAuth(Arc<String>);

#[derive(Clone)]
pub struct MediaServer {
    port: u16,
    data_dir: PathBuf,
    token: Arc<String>,
}

impl MediaServer {
    pub async fn start(data_dir: PathBuf) -> Result<Self, AppError> {
        let imports_dir = data_dir.join("imports");
        std::fs::create_dir_all(&imports_dir).map_err(|err| {
            AppError::Internal(format!("Failed to create imports dir for media server: {err}"))
        })?;

        let token = Arc::new(Uuid::new_v4().to_string());
        let auth = MediaAuth(Arc::clone(&token));

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods([Method::GET, Method::HEAD, Method::OPTIONS])
            .allow_headers(Any);

        let app = Router::new()
            .nest_service("/imports", ServeDir::new(imports_dir))
            .layer(cors)
            .layer(middleware::from_fn_with_state(auth, require_media_token));

        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .map_err(|err| AppError::Internal(format!("Failed to bind media server: {err}")))?;

        let port = listener
            .local_addr()
            .map_err(|err| AppError::Internal(format!("Failed to read media server addr: {err}")))?
            .port();

        tokio::spawn(async move {
            if let Err(err) = axum::serve(listener, app).await {
                tracing::error!("Media server stopped: {err}");
            }
        });

        tracing::info!("Media server listening on http://127.0.0.1:{port} (token required)");

        Ok(Self {
            port,
            data_dir,
            token,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    /// Build a URL for a file under `{data_dir}/imports/...`.
    pub fn url_for_import_file(&self, absolute_path: &Path) -> Result<String, AppError> {
        let imports_root = self.data_dir.join("imports");
        let abs = absolute_path
            .canonicalize()
            .map_err(|err| AppError::Media(format!("Invalid playable path: {err}")))?;
        let root = imports_root
            .canonicalize()
            .map_err(|err| AppError::Internal(format!("Imports root missing: {err}")))?;

        let relative = abs.strip_prefix(&root).map_err(|_| {
            AppError::Media("Playable file is outside the imports directory".into())
        })?;

        let rel = relative.to_string_lossy().replace('\\', "/");
        Ok(format!(
            "http://127.0.0.1:{}/imports/{}?vocalis_token={}",
            self.port, rel, self.token
        ))
    }
}

pub type SharedMediaServer = Arc<MediaServer>;

async fn require_media_token(
    State(auth): State<MediaAuth>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let expected = auth.0.as_str();
    let query_ok = params
        .get("vocalis_token")
        .map(|value| value == expected)
        .unwrap_or(false);
    let header_ok = headers
        .get("x-vocalis-media-token")
        .and_then(|value| value.to_str().ok())
        .map(|value| value == expected)
        .unwrap_or(false);

    if query_ok || header_ok {
        Ok(next.run(request).await)
    } else {
        Ok((StatusCode::FORBIDDEN, "media token required").into_response())
    }
}
