import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquare,
  Camera,
  Image as ImageIcon,
  Send,
  Trash2,
  X,
  Lock,
  Plus,
  Loader2,
  AlertCircle,
  Sparkles,
  Maximize2,
  Download,
} from 'lucide-react';
import type { Tower, Comment, User } from '../types';
import { api, post, del, formatDate } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface Props {
  tower: Tower;
  user: User | null;
  onRequireAuth: () => void;
  onNotice: (msg: string) => void;
  onOpenCreateStation?: (tower: Tower) => void;
}

export default function StationComments({
  tower,
  user,
  onRequireAuth,
  onNotice,
  onOpenCreateStation,
}: Props) {
  const { t, lang } = useI18n();
  const isPl = lang === 'pl';
  const isBtmap = tower.source === 'BTMAP' || tower.source === 'User';

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch comments when tower changes
  useEffect(() => {
    if (!isBtmap) {
      setComments([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');

    api<Comment[]>(`/towers/${encodeURIComponent(tower.id)}/comments`)
      .then(data => {
        if (active) setComments(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        if (active) setError(err.message || 'Nie udało się wczytać komentarzy.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tower.id, isBtmap]);

  // Clean up preview object url
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onNotice(isPl ? 'Wybierz prawidłowy plik graficzny (JPEG, PNG, WEBP).' : 'Select a valid image file (JPEG, PNG, WEBP).');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      onNotice(isPl ? 'Zdjęcie jest za duże (maksymalnie 15 MB).' : 'Image is too large (maximum 15 MB).');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireAuth();
      return;
    }

    const trimmed = text.trim();
    if (!trimmed && !selectedFile) {
      onNotice(isPl ? 'Wpisz treść komentarza lub wybierz zdjęcie.' : 'Enter comment text or select a photo.');
      return;
    }

    setSubmitting(true);
    try {
      let imageBase64: string | undefined;
      if (selectedFile) {
        imageBase64 = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(selectedFile);
        });
      }

      const newComment = await post<Comment>(`/towers/${encodeURIComponent(tower.id)}/comments`, {
        text: trimmed,
        imageBase64,
      });

      setComments(prev => [newComment, ...prev]);
      setText('');
      clearPhoto();

      onNotice(
        selectedFile
          ? (isPl ? 'Opublikowano komentarz ze zdjęciem WebP! (+15 pkt)' : 'Comment posted with WebP photo! (+15 pts)')
          : (isPl ? 'Opublikowano komentarz! (+5 pkt)' : 'Comment posted! (+5 pts)')
      );
    } catch (err) {
      onNotice((err as Error).message || (isPl ? 'Błąd podczas dodawania komentarza.' : 'Failed to post comment.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const confirmMsg = isPl
      ? 'Czy na pewno chcesz usunąć ten komentarz?'
      : 'Are you sure you want to delete this comment?';
    if (!window.confirm(confirmMsg)) return;

    try {
      await del(`/towers/${encodeURIComponent(tower.id)}/comments/${encodeURIComponent(commentId)}`);
      setComments(prev => prev.filter(c => c.id !== commentId));
      onNotice(isPl ? 'Komentarz został usunięty.' : 'Comment has been deleted.');
    } catch (err) {
      onNotice((err as Error).message || (isPl ? 'Nie udało się usunąć komentarza.' : 'Failed to delete comment.'));
    }
  };

  // 1. UKE RAW PERMIT NOTICE (Comments only available for BTMap stations)
  if (!isBtmap) {
    return (
      <section className="station-comments-section" aria-label="Komentarze stacji">
        <div className="station-comments-header">
          <div className="station-comments-title">
            <MessageSquare size={16} />
            <h3>{isPl ? 'Komentarze i zdjęcia z terenu' : 'Field Comments & Photos'}</h3>
          </div>
        </div>
        <div className="station-comments-uke-card">
          <div className="uke-card-icon">
            <Lock size={20} />
          </div>
          <div className="uke-card-body">
            <h4>{isPl ? 'Dostępne dla stacji w bazie BTMap' : 'Available for BTMap stations'}</h4>
            <p>
              {isPl
                ? 'Ta stacja pochodzi z surowego rejestru pozwoleń UKE. Komentarze oraz zdjęcia z terenu są włączone dla stacji zweryfikowanych w bazie społecznościowej BTMap.'
                : 'This station is from the raw UKE permits register. Field comments and photos are available for stations verified in the BTMap community database.'}
            </p>
            {onOpenCreateStation && (
              <button
                type="button"
                className="primary-button uke-card-action"
                onClick={() => onOpenCreateStation(tower)}
              >
                <Plus size={15} />
                <span>{isPl ? 'Dodaj tę stację do bazy BTMap' : 'Add station to BTMap'}</span>
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // 2. BTMAP COMMUNITY STATION COMMENTS & PHOTOS
  return (
    <section className="station-comments-section" aria-label="Komentarze i zdjęcia stacji">
      <div className="station-comments-header">
        <div className="station-comments-title">
          <MessageSquare size={16} />
          <h3>{isPl ? 'Komentarze i zdjęcia z terenu' : 'Field Comments & Photos'}</h3>
          <span className="comments-count-pill">{comments.length}</span>
        </div>
        <span className="webp-auto-badge" title="Wszystkie zdjęcia są automatycznie optymalizowane do lekkiego formatu WebP">
          <Sparkles size={12} />
          <span>WebP Auto</span>
        </span>
      </div>

      {/* Add comment form or login callout */}
      {!user ? (
        <div className="comments-auth-callout">
          <p>{isPl ? 'Zaloguj się, aby dodać komentarz i zdjęcia masztu z terenu.' : 'Log in to add field comments and tower photos.'}</p>
          <button type="button" className="secondary-button" onClick={onRequireAuth}>
            {isPl ? 'Zaloguj się' : 'Log in'}
          </button>
        </div>
      ) : (
        <form className="comments-form" onSubmit={handleSubmit}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={
              isPl
                ? 'Napisz raport z terenu (stan masztu, pasma, speedtest, dojazd drogą)...'
                : 'Write a field report (mast condition, active bands, speedtest, access)...'
            }
            rows={3}
            maxLength={2000}
            disabled={submitting}
          />

          {/* Photo attachment preview */}
          {previewUrl && (
            <div className="comment-photo-preview-wrap">
              <div className="comment-photo-preview">
                <img src={previewUrl} alt="Podgląd zdjęcia" />
                <button
                  type="button"
                  className="comment-photo-remove"
                  onClick={clearPhoto}
                  title={isPl ? 'Usuń załączone zdjęcie' : 'Remove photo'}
                  aria-label={isPl ? 'Usuń zdjęcie' : 'Remove photo'}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="comment-photo-info">
                <span className="photo-name">{selectedFile?.name}</span>
                <span className="photo-size">
                  {selectedFile ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB` : ''} · WebP
                </span>
              </div>
            </div>
          )}

          <div className="comments-form-footer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              disabled={submitting}
            />
            <button
              type="button"
              className={`comment-attach-btn ${selectedFile ? 'has-file' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
              title={isPl ? 'Dołącz zdjęcie masztu (konwersja do WebP)' : 'Attach tower photo (WebP)'}
            >
              <Camera size={15} />
              <span>{selectedFile ? (isPl ? 'Zmień zdjęcie' : 'Change photo') : (isPl ? 'Dodaj zdjęcie' : 'Add photo')}</span>
            </button>

            <button
              type="submit"
              className="primary-button comment-submit-btn"
              disabled={submitting || (!text.trim() && !selectedFile)}
            >
              {submitting ? (
                <>
                  <Loader2 size={15} className="spin-icon" />
                  <span>{isPl ? 'Optymalizacja WebP…' : 'Processing WebP…'}</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>{isPl ? 'Opublikuj' : 'Post'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Error state */}
      {error && (
        <div className="comments-error-state" role="alert">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="comments-loading-state">
          <Loader2 size={20} className="spin-icon" />
          <span>{isPl ? 'Wczytywanie komentarzy…' : 'Loading comments…'}</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && comments.length === 0 && (
        <div className="comments-empty-state">
          <Camera size={28} className="empty-cam-icon" />
          <p>
            {isPl
              ? 'Brak komentarzy dla tej stacji. Bądź pierwszy i dodaj raport z terenu lub zdjęcie masztu!'
              : 'No comments for this station yet. Be the first to add a field report or photo!'}
          </p>
        </div>
      )}

      {/* Comments list */}
      {!loading && comments.length > 0 && (
        <div className="comments-list">
          {comments.map(c => {
            const canDelete = Boolean(user && (user.nick === c.userNick || user.role === 'ADMIN'));
            const avatarInitial = (c.userNick || 'U')[0].toUpperCase();

            return (
              <article key={c.id} className="comment-card">
                <header className="comment-card-header">
                  <div className="comment-author">
                    <span className="comment-avatar">{avatarInitial}</span>
                    <strong className="comment-nick">{c.userNick}</strong>
                    <time className="comment-date" dateTime={c.createdAt}>
                      {formatDate(c.createdAt)}
                    </time>
                  </div>

                  {canDelete && (
                    <button
                      type="button"
                      className="comment-delete-btn"
                      onClick={() => handleDelete(c.id)}
                      title={isPl ? 'Usuń komentarz' : 'Delete comment'}
                      aria-label={isPl ? 'Usuń komentarz' : 'Delete comment'}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </header>

                {c.text && <p className="comment-text">{c.text}</p>}

                {c.photoUrl && (
                  <div className="comment-photo-card">
                    <button
                      type="button"
                      className="comment-photo-btn"
                      onClick={() => setActivePhoto(c.photoUrl || null)}
                      title={isPl ? 'Kliknij, aby powiększyć zdjęcie' : 'Click to enlarge photo'}
                    >
                      <img
                        src={c.photoUrl}
                        alt={`Zdjęcie dodane przez ${c.userNick}`}
                        loading="lazy"
                        className="comment-img"
                      />
                      <span className="comment-photo-badge">
                        <Maximize2 size={12} />
                        <span>WebP</span>
                      </span>
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal for Fullscreen Photo View */}
      {activePhoto &&
        createPortal(
          <div className="photo-lightbox-overlay" onClick={() => setActivePhoto(null)}>
            <div className="photo-lightbox-content" onClick={e => e.stopPropagation()}>
              <img src={activePhoto} alt="Zdjęcie stacji bazowej" className="photo-lightbox-img" />
              <div className="photo-lightbox-actions">
                <a
                  href={activePhoto}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="photo-lightbox-btn"
                  title={isPl ? 'Pobierz zdjęcie' : 'Download photo'}
                >
                  <Download size={16} />
                </a>
                <button
                  type="button"
                  className="photo-lightbox-btn"
                  onClick={() => setActivePhoto(null)}
                  title={isPl ? 'Zamknij' : 'Close'}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
