import numpy as np

try:
    import sounddevice as sd

    HAS_SOUNDDEVICE = True
except OSError:
    HAS_SOUNDDEVICE = False
    sd = None
import threading
import queue
import time
import logging
from typing import Optional

logger = logging.getLogger("uvicorn.error")


class QuickTranscriber:
    """
    Grava áudio até detectar silêncio e transcreve com Faster-Whisper.
    Usado para transcrição rápida no chat (microfone do input).
    """

    def __init__(self, model, sample_rate=16000):
        self.model = model
        self.sample_rate = sample_rate

        # Parâmetros de detecção de voz - mais responsivos
        self.speech_energy_threshold = 0.015
        self.silence_chunks_required = 8  # ~1s of silence (8 chunks of 125ms)
        self.min_speech_chunks = 1  # Mínimo 125ms de fala
        self.max_recording_duration = 30.0  # Máximo 30 segundos (safety)
        self.blocksize = 2000  # 125ms chunks (mais responsivo)
        self.stop_requested = False
        self.is_recording_active = False
        self.stop_event = None

    def stop_recording(self):
        """Sinaliza para parar a gravação atual."""
        if self.is_recording_active:
            logger.info("[QuickTranscriber] Stop requested manually")
            self.stop_requested = True
            if self.stop_event:
                self.stop_event.set()

    def _get_chunk_energy(self, chunk: np.ndarray) -> float:
        """Calcula a energia RMS de um chunk de áudio."""
        return np.sqrt(np.mean(chunk**2))

    def record_until_silence(self) -> Optional[np.ndarray]:
        """
        Grava áudio até detectar silêncio por ~1 segundo ou até ser interrompido manualmente.
        Retorna o áudio gravado ou None se não houve fala suficiente.
        """
        if not HAS_SOUNDDEVICE:
            logger.warning("[QuickTranscriber] Sounddevice not available.")
            return None

        self.stop_requested = False
        self.is_recording_active = True
        self.stop_event = threading.Event()

        audio_buffer = []
        silence_counter = 0
        speech_chunk_count = 0
        recorded_samples = 0
        max_samples = int(self.max_recording_duration * self.sample_rate)
        is_looping = True
        audio_queue = queue.Queue()

        def audio_callback(indata, frames, time_info, status):
            try:
                if status:
                    status_str = str(status)
                    if "overflow" not in status_str.lower():
                        logger.warning(f"[QuickTranscriber] Audio Status: {status}")

                # Copia os dados imediatamente
                chunk = np.array(indata, dtype=np.float32).flatten()

                # Adiciona à fila para processamento
                try:
                    audio_queue.put_nowait(chunk)
                except queue.Full:
                    # Se a fila estiver cheia, descarta o chunk mais antigo
                    try:
                        audio_queue.get_nowait()
                        audio_queue.put_nowait(chunk)
                    except:
                        pass

                # Verifica se deve parar
                if self.stop_event.is_set():
                    raise sd.CallbackStop

            except Exception as e:
                logger.error(f"[QuickTranscriber] Callback error: {e}")

        try:
            with sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype="float32",
                blocksize=self.blocksize,  # 125ms chunks (mais responsivo)
                callback=audio_callback,
            ):
                logger.info("[QuickTranscriber] Recording started...")
                start_time = time.time()

                while is_looping:
                    # Check for manual stop or stop event from callback/external
                    if self.stop_requested or self.stop_event.is_set():
                        logger.info("[QuickTranscriber] Interrupted by user request or event")
                        is_looping = False
                        self.stop_event.set()
                        break

                    try:
                        # Tenta obter chunk da fila com timeout
                        # Se self.stop_event for setado em outra thread, o self.stop_requested check acima pegará na próxima iteração
                        # ou o áudio parará no callback.
                        chunk = audio_queue.get(timeout=0.1)
                        audio_buffer.append(chunk)
                        recorded_samples += len(chunk)

                        # Análise de energia
                        energy = self._get_chunk_energy(chunk)
                        is_speech = energy > self.speech_energy_threshold

                        if is_speech:
                            speech_chunk_count += 1
                            silence_counter = 0
                        else:
                            silence_counter += 1

                        # Para se detectar silêncio suficiente E já tivemos fala suficiente
                        if (
                            silence_counter >= self.silence_chunks_required
                            and speech_chunk_count >= self.min_speech_chunks
                        ):
                            logger.info(
                                f"[QuickTranscriber] Silence detected, stopping..."
                            )
                            is_looping = False
                            self.stop_event.set()

                        # Safety: para se atingir duração máxima
                        if recorded_samples >= max_samples:
                            logger.info("[QuickTranscriber] Max duration reached")
                            is_looping = False
                            self.stop_event.set()

                    except queue.Empty:
                        # Verifica timeout global
                        if time.time() - start_time > self.max_recording_duration + 2:
                            logger.info("[QuickTranscriber] Global timeout")
                            is_looping = False
                            self.stop_event.set()
                        continue

        except Exception as e:
            logger.error(f"[QuickTranscriber] Recording error: {e}")
            return None
        finally:
            self.is_recording_active = False
            if self.stop_event:
                self.stop_event.set()
            self.stop_event = None


        # Processa o resultado
        # Se foi parado manualmente, transcrevemos o que temos mesmo que seja pouco
        if not audio_buffer or (not self.stop_requested and speech_chunk_count < self.min_speech_chunks):
            logger.info("[QuickTranscriber] Not enough speech detected")
            return None

        try:
            # Concatena todos os chunks
            audio = np.concatenate(audio_buffer)
            duration = len(audio) / self.sample_rate
            logger.info(
                f"[QuickTranscriber] Recording complete: {duration:.1f}s, "
                f"{speech_chunk_count} speech chunks"
            )
            return audio
        except Exception as e:
            logger.error(f"[QuickTranscriber] Error concatenating audio: {e}")
            return None

    def transcribe(self, audio: np.ndarray) -> str:
        """Transcreve o áudio usando Faster-Whisper."""
        try:
            segments, info = self.model.transcribe(
                audio,
                language="pt",
                beam_size=1,  # Mais rápido
                best_of=1,
                patience=1,
                condition_on_previous_text=False,
            )

            text = " ".join([segment.text for segment in segments]).strip()
            logger.info(f"[QuickTranscriber] Transcribed: '{text}'")
            return text

        except Exception as e:
            logger.error(f"[QuickTranscriber] Transcription error: {e}")
            return ""

    def record_and_transcribe(self) -> str:
        """Grava e transcreve em uma única chamada."""
        audio = self.record_until_silence()
        if audio is None:
            return ""
        return self.transcribe(audio)

