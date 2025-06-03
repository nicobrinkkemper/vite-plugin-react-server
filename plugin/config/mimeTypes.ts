export const MIME_TYPES: Record<string, string> = {
    // HTML and Web
    '.html': 'text/html',
    '.htm': 'text/html',
    '.xhtml': 'application/xhtml+xml',
    '.xml': 'application/xml',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.cjs': 'application/javascript',
    '.jsx': 'application/javascript',
    '.ts': 'application/javascript',
    '.tsx': 'application/javascript',
    '.json': 'application/json',
    '.map': 'application/json',
    '.wasm': 'application/wasm',
    '.webmanifest': 'application/manifest+json',

    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.apng': 'image/apng',

    // Fonts
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.sfnt': 'font/sfnt',

    // Video
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.m4v': 'video/x-m4v',
    '.m4s': 'video/iso.segment',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.mpd': 'application/dash+xml',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.mkv': 'video/x-matroska',
    '.3gp': 'video/3gpp',
    '.m2ts': 'video/mp2t',

    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',

    // Documents
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // Archives
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',

    // Data
    '.csv': 'text/csv',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.yaml': 'application/yaml',
    '.yml': 'application/yaml',

    // React specific
    '.rsc': 'text/x-component'
  };