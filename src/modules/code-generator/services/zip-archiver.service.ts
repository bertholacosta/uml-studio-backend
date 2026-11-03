import { Injectable } from '@nestjs/common';
import JSZip from 'jszip';
import { GeneratedFileDto } from '../dtos/code-generation-preview-response.dto';

@Injectable()
export class ZipArchiverService {
  /**
   * Comprime en memoria la lista de archivos generados en un archivo ZIP.
   * @param files Lista de archivos generados con sus rutas relativas.
   * @param rootDir Nombre opcional del directorio raíz dentro del archivo ZIP.
   * @returns Buffer binario del archivo ZIP.
   */
  async createZipBuffer(
    files: GeneratedFileDto[],
    rootDir = '',
  ): Promise<Buffer> {
    const zip = new JSZip();

    for (const file of files) {
      const entryPath = rootDir ? `${rootDir}/${file.path}` : file.path;
      zip.file(entryPath, file.content, {
        base64: file.encoding === 'base64',
        // Permisos Unix para que scripts como gradlew sean ejecutables al descomprimir
        unixPermissions: file.executable ? 0o755 : 0o644,
      });
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      platform: 'UNIX',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9,
      },
    });

    return zipBuffer;
  }
}
