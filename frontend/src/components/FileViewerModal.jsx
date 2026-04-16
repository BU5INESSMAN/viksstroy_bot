import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ZoomIn, ZoomOut, RotateCw, Download } from 'lucide-react';

const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function FileViewerModal({ isOpen, onClose, fileUrl, fileName }) {
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        if (isOpen) { setZoom(1); setRotation(0); }
    }, [isOpen, fileUrl]);

    useEffect(() => {
        if (!isOpen) return;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen || !fileUrl) return null;

    // Detect extension from fileName (preferred) — fileUrl is /api/files/{id}/download so no extension there
    const nameParts = (fileName || '').split('.');
    const ext = nameParts.length > 1 ? nameParts.pop().toLowerCase() : '';
    const isPdf = ext === 'pdf';
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);

    const preventSwipe = (e) => e.stopPropagation();

    const motionProps = prefersReducedMotion ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    {...motionProps}
                    className="fixed inset-0 z-[500] bg-black/95 flex flex-col"
                    onTouchMove={preventSwipe}
                    onTouchStart={preventSwipe}
                    style={{ touchAction: 'none' }}
                >
                    {/* Header */}
                    <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/80 border-b border-white/10">
                        <h3 className="text-sm text-white truncate flex-1 mr-4 font-medium">{fileName || 'Файл'}</h3>

                        <div className="flex items-center gap-1.5">
                            {isImage && (
                                <>
                                    <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
                                        className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-95">
                                        <ZoomOut className="w-4 h-4 text-white" />
                                    </button>
                                    <span className="text-xs text-white/50 w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
                                    <button onClick={() => setZoom(z => Math.min(4, z + 0.25))}
                                        className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-95">
                                        <ZoomIn className="w-4 h-4 text-white" />
                                    </button>
                                    <button onClick={() => setRotation(r => (r + 90) % 360)}
                                        className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-95">
                                        <RotateCw className="w-4 h-4 text-white" />
                                    </button>
                                </>
                            )}

                            <a href={fileUrl.includes('?') ? `${fileUrl}&download=1` : `${fileUrl}?download=1`} download={fileName} title="Скачать"
                                className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-95">
                                <Download className="w-4 h-4 text-white" />
                            </a>

                            <button onClick={onClose}
                                className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-95">
                                <X className="w-5 h-5 text-white" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div
                        className="flex-1 overflow-auto flex items-center justify-center"
                        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
                        style={{ touchAction: isPdf ? 'auto' : 'none' }}
                    >
                        {isPdf && (
                            <iframe
                                src={fileUrl + '#toolbar=1'}
                                className="w-full h-full"
                                title={fileName}
                                style={{ border: 'none', background: 'white' }}
                            />
                        )}

                        {isImage && (
                            <img
                                src={fileUrl}
                                alt={fileName}
                                className="max-w-none select-none transition-transform duration-200 ease-out"
                                style={{
                                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                                    maxWidth: zoom <= 1 ? '100%' : 'none',
                                    maxHeight: zoom <= 1 ? '100%' : 'none',
                                }}
                                draggable={false}
                                onDragStart={e => e.preventDefault()}
                            />
                        )}

                        {!isPdf && !isImage && (
                            <div className="text-center p-8">
                                <p className="text-white/50 text-lg mb-4">Предпросмотр недоступен для этого типа файла</p>
                                <a href={fileUrl.includes('?') ? `${fileUrl}&download=1` : `${fileUrl}?download=1`} download={fileName}
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors font-bold text-sm">
                                    <Download className="w-5 h-5" /> Скачать файл
                                </a>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
