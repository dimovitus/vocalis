use crate::error::AppError;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WavFormat {
    pub audio_format: u16,
    pub channels: u16,
    pub sample_rate: u32,
    pub bits_per_sample: u16,
    pub block_align: u16,
}

#[derive(Debug, Clone)]
pub struct WavInfo {
    pub format: WavFormat,
    pub data_offset: u64,
    pub data_size: u64,
}

impl WavInfo {
    pub fn frame_count(&self) -> u64 {
        if self.format.block_align == 0 {
            return 0;
        }
        self.data_size / u64::from(self.format.block_align)
    }

    pub fn duration_secs(&self) -> f64 {
        if self.format.sample_rate == 0 {
            return 0.0;
        }
        self.frame_count() as f64 / f64::from(self.format.sample_rate)
    }
}

/// Parse a PCM WAV file and locate the `data` chunk without loading samples.
pub fn inspect_wav(path: &Path) -> Result<WavInfo, AppError> {
    let mut file = File::open(path).map_err(|err| {
        AppError::Media(format!("Failed to open WAV {}: {err}", path.display()))
    })?;

    let mut header = [0u8; 12];
    file.read_exact(&mut header).map_err(|err| {
        AppError::Media(format!("Invalid WAV header: {err}"))
    })?;

    if &header[0..4] != b"RIFF" || &header[8..12] != b"WAVE" {
        return Err(AppError::Media(
            "File is not a RIFF/WAVE audio file".into(),
        ));
    }

    let mut format: Option<WavFormat> = None;
    let mut data_offset = 0u64;
    let mut data_size = 0u64;

    loop {
        let mut chunk_hdr = [0u8; 8];
        match file.read_exact(&mut chunk_hdr) {
            Ok(()) => {}
            Err(err) if err.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(err) => {
                return Err(AppError::Media(format!("Failed reading WAV chunks: {err}")));
            }
        }

        let chunk_id = &chunk_hdr[0..4];
        let chunk_size = u32::from_le_bytes(chunk_hdr[4..8].try_into().unwrap()) as u64;
        let chunk_data_pos = file.stream_position().map_err(|err| {
            AppError::Internal(format!("WAV seek failed: {err}"))
        })?;

        if chunk_id == b"fmt " {
            let mut fmt_buf = vec![0u8; chunk_size.min(64) as usize];
            file.read_exact(&mut fmt_buf).map_err(|err| {
                AppError::Media(format!("Failed reading fmt chunk: {err}"))
            })?;

            if fmt_buf.len() < 16 {
                return Err(AppError::Media("fmt chunk too short".into()));
            }

            let audio_format = u16::from_le_bytes(fmt_buf[0..2].try_into().unwrap());
            let channels = u16::from_le_bytes(fmt_buf[2..4].try_into().unwrap());
            let sample_rate = u32::from_le_bytes(fmt_buf[4..8].try_into().unwrap());
            let block_align = u16::from_le_bytes(fmt_buf[12..14].try_into().unwrap());
            let bits_per_sample = u16::from_le_bytes(fmt_buf[14..16].try_into().unwrap());

            if audio_format != 1 {
                return Err(AppError::Media(format!(
                    "Unsupported WAV format {audio_format} (only PCM supported)"
                )));
            }
            if bits_per_sample != 16 {
                return Err(AppError::Media(format!(
                    "Unsupported bits_per_sample {bits_per_sample} (expected 16)"
                )));
            }

            format = Some(WavFormat {
                audio_format,
                channels,
                sample_rate,
                bits_per_sample,
                block_align,
            });
        } else if chunk_id == b"data" {
            data_offset = chunk_data_pos;
            data_size = chunk_size;
            break;
        } else {
            file.seek(SeekFrom::Current(chunk_size as i64))
                .map_err(|err| AppError::Internal(format!("WAV chunk skip failed: {err}")))?;
        }

        // Chunks are word-aligned.
        if chunk_size % 2 == 1 {
            let _ = file.seek(SeekFrom::Current(1));
        }
    }

    let format = format.ok_or_else(|| AppError::Media("WAV missing fmt chunk".into()))?;
    if data_size == 0 {
        return Err(AppError::Media("WAV missing data chunk".into()));
    }

    Ok(WavInfo {
        format,
        data_offset,
        data_size,
    })
}

/// Stream PCM frames and invoke `on_frame` with mono mix amplitude in [-1, 1].
pub fn for_each_frame<F>(path: &Path, mut on_frame: F) -> Result<WavInfo, AppError>
where
    F: FnMut(f32),
{
    let info = inspect_wav(path)?;
    let mut file = File::open(path).map_err(|err| {
        AppError::Media(format!("Failed to open WAV for decode: {err}"))
    })?;
    file.seek(SeekFrom::Start(info.data_offset)).map_err(|err| {
        AppError::Internal(format!("Failed to seek to PCM data: {err}"))
    })?;

    let channels = info.format.channels as usize;
    if channels == 0 {
        return Err(AppError::Media("WAV has zero channels".into()));
    }

    let bytes_per_frame = info.format.block_align as usize;
    let mut remaining = info.data_size;
    let mut buffer = vec![0u8; bytes_per_frame.max(4096) * 256];

    while remaining > 0 {
        let to_read = (buffer.len() as u64).min(remaining) as usize;
        let aligned = to_read - (to_read % bytes_per_frame);
        if aligned == 0 {
            break;
        }

        file.read_exact(&mut buffer[..aligned]).map_err(|err| {
            AppError::Media(format!("Failed reading PCM frames: {err}"))
        })?;
        remaining -= aligned as u64;

        for frame in buffer[..aligned].chunks_exact(bytes_per_frame) {
            let mut mix = 0.0f32;
            for ch in 0..channels {
                let offset = ch * 2;
                if offset + 2 > frame.len() {
                    break;
                }
                let sample = i16::from_le_bytes([frame[offset], frame[offset + 1]]);
                mix += f32::from(sample) / 32768.0;
            }
            on_frame(mix / channels as f32);
        }
    }

    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_wav() {
        let dir = std::env::temp_dir().join("vocalis-wav-reject");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("x.txt");
        std::fs::write(&path, b"hello").unwrap();
        assert!(inspect_wav(&path).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }
}
