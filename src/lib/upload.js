import { put } from '@vercel/blob';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Sube una imagen a un almacenamiento persistente.
 *
 * En producción (cuando existe BLOB_READ_WRITE_TOKEN) usa Vercel Blob,
 * que funciona en entornos serverless. En desarrollo local, si no hay
 * token, guarda en public/uploads como respaldo.
 *
 * @param {File} file   Archivo del FormData
 * @param {string} folder  Subcarpeta lógica: 'products' | 'avatars' | 'logos'
 * @param {string} name    Nombre base sin extensión (ej. el id del recurso)
 * @returns {Promise<string>} URL pública de la imagen guardada
 */
export async function uploadImage(file, folder, name) {
    if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error('Formato no válido. Usa JPG, PNG o WebP');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_SIZE) {
        throw new Error('La imagen no debe superar 2MB');
    }

    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const filename = `${name}.${ext}`;

    // Producción / cuando Blob está configurado.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blob = await put(`uploads/${folder}/${filename}`, buffer, {
            access: 'public',
            contentType: file.type,
            addRandomSuffix: false,
            allowOverwrite: true,
        });
        return blob.url;
    }

    // Respaldo para desarrollo local sin Blob configurado.
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', folder);
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);
    return `/uploads/${folder}/${filename}`;
}
