/**
 * Image Storage Service — re-export barrel
 * 실제 구현은 src/services/image/imageStorageService.ts로 이동.
 * 기존 import 경로 호환을 위해 유지.
 */
export {
  uploadBase64Image,
  uploadAllImages,
  replaceBase64WithUrls,
  stripBase64FromHtml,
  restoreAndUploadImages,
} from './image/imageStorageService';
