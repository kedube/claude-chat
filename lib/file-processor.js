import { readFileSync } from "fs";
import { basename } from "path";
import multer from "multer";
import { UPLOAD_DIR } from "./config.js";

// Supported file types
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const PDF_EXTENSIONS = [".pdf"];
const TEXT_EXTENSIONS = [
  ".txt", ".md", ".json", ".xml", ".html", ".htm", ".css", ".js", ".ts",
  ".jsx", ".tsx", ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".cs",
  ".rb", ".go", ".rs", ".php", ".swift", ".kt", ".scala", ".sh", ".bash",
  ".zsh", ".fish", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
  ".log", ".csv", ".tsv", ".sql", ".r", ".m", ".pl", ".lua", ".vim",
  ".tex", ".rtf", ".diff", ".patch", ".gitignore", ".env", ".properties"
];

export const ALLOWED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...PDF_EXTENSIONS, ...TEXT_EXTENSIONS];

/**
 * Multer middleware configuration for file uploads
 */
export const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
    files: 5 // Max 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (!ext || ext === file.originalname.toLowerCase()) {
      return cb(new Error(`File must have a valid extension`));
    }

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`File type "${ext}" is not supported. Allowed: images (.png, .jpg, .gif, .webp), PDFs (.pdf), and text files (.txt, .json, .md, code files, etc.)`));
    }

    cb(null, true);
  }
});

/**
 * Helper to determine media type from file extension
 * @param {string} filename - The filename to check
 * @returns {string} MIME type for the file
 */
export function getMediaType(filename) {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  const mediaTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return mediaTypes[ext] || 'text/plain';
}

/**
 * Process uploaded files into Anthropic content format and save to workspace
 * @param {Array} files - Array of uploaded files (from multer)
 * @param {string} sessionId - The session ID
 * @returns {Object} { apiContent: Array, fileReferences: Array }
 */
export function processUploadedFiles(files, sessionId) {
  const apiContent = [];
  const fileReferences = [];

  if (!sessionId) {
    throw new Error("sessionId is required for processUploadedFiles");
  }

  for (const file of files) {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    const filename = basename(file.originalname);

    // Create file reference for message history (metadata only - files are not persisted)
    const fileRef = {
      type: "file_ref",
      name: filename,
      size: file.size,
      mimeType: file.mimetype
    };
    fileReferences.push(fileRef);

    // Create API content based on file type
    if (IMAGE_EXTENSIONS.includes(ext)) {
      // Image files - use "image" type
      const fileData = readFileSync(file.path);
      const base64Data = fileData.toString('base64');
      const mediaType = getMediaType(file.originalname);

      apiContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64Data
        }
      });
    } else if (PDF_EXTENSIONS.includes(ext)) {
      // PDF files - use "document" type
      const fileData = readFileSync(file.path);
      const base64Data = fileData.toString('base64');

      apiContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64Data
        },
        cache_control: { type: "ephemeral" }
      });
    } else {
      // Text files - include as text
      const textContent = readFileSync(file.path, 'utf-8');
      apiContent.push({
        type: "text",
        text: `--- File: ${file.originalname} ---\n${textContent}\n--- End of ${file.originalname} ---`
      });
    }
  }

  return { apiContent, fileReferences };
}
