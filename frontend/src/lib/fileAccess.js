import { api, BACKEND_API } from "@/lib/api";

export async function getFileDownloadUrl(fileId) {
  const { data } = await api.get(`/files/${fileId}/download-token`);
  return `${BACKEND_API}/files/${fileId}/download?download_token=${encodeURIComponent(data.token)}`;
}

export async function getFilePreviewObjectUrl(fileId) {
  const { data } = await api.get(`/files/${fileId}/download`, { responseType: "blob" });
  return URL.createObjectURL(data);
}
