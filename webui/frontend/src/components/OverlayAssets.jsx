import React, { useState, useEffect } from "react";
import {
  Upload,
  Trash2,
  Eye,
  X,
  AlertCircle,
  CheckCircle,
  Image as ImageIcon,
  FileImage,
  Download,
  Type,
  Filter,
} from "lucide-react";

const OverlayAssets = () => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filterType, setFilterType] = useState("all"); // "all", "image", "font"

  // Load files on mount
  useEffect(() => {
    loadFiles();
  }, []);

  // Auto-hide messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const loadFiles = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/overlayfiles");
      const data = await response.json();

      if (data.success) {
        setFiles(data.files || []);
      } else {
        setError("Failed to load overlay files");
      }
    } catch (err) {
      console.error("Error loading overlay files:", err);
      setError("Failed to load overlay files: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type - images and fonts
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "font/ttf",
      "font/otf",
      "font/woff",
      "font/woff2",
      "application/x-font-ttf",
      "application/x-font-otf",
      "application/font-woff",
      "application/font-woff2",
    ];

    const fileExtension = file.name.split(".").pop().toLowerCase();
    const validExtensions = [
      "png",
      "jpg",
      "jpeg",
      "ttf",
      "otf",
      "woff",
      "woff2",
    ];

    if (!validExtensions.includes(fileExtension)) {
      setError(
        "Invalid file type. Only PNG, JPEG, TTF, OTF, WOFF, and WOFF2 files are allowed."
      );
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size too large. Maximum size is 10MB.");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setSuccess(null);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/overlayfiles/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(data.message || "File uploaded successfully");
        await loadFiles(); // Reload file list
        // Reset file input
        event.target.value = "";
      } else {
        setError(data.detail || "Failed to upload file");
      }
    } catch (err) {
      console.error("Error uploading file:", err);
      setError("Failed to upload file: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename) => {
    try {
      setError(null);
      setSuccess(null);

      const response = await fetch(`/api/overlayfiles/${filename}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(data.message || "File deleted successfully");
        await loadFiles(); // Reload file list
        setDeleteConfirm(null);
      } else {
        setError(data.detail || "Failed to delete file");
      }
    } catch (err) {
      console.error("Error deleting file:", err);
      setError("Failed to delete file: " + err.message);
    }
  };

  const getFileExtension = (filename) => {
    return filename.split(".").pop().toUpperCase();
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const filteredFiles = files.filter((file) => {
    if (filterType === "all") return true;
    return file.type === filterType;
  });

  const imageCount = files.filter((f) => f.type === "image").length;
  const fontCount = files.filter((f) => f.type === "font").length;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-theme-text mb-2">
          Overlay Assets
        </h1>
        <p className="text-theme-muted">
          Manage overlay files (Images: PNG, JPEG | Fonts: TTF, OTF, WOFF,
          WOFF2)
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-500 font-medium">Error</p>
            <p className="text-red-400 text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-6 bg-green-500/10 border border-green-500 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-green-500 font-medium">Success</p>
            <p className="text-green-400 text-sm mt-1">{success}</p>
          </div>
          <button
            onClick={() => setSuccess(null)}
            className="text-green-400 hover:text-green-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-theme-card border border-theme rounded-lg p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Upload className="w-5 h-5 text-theme-primary" />
          <h2 className="text-xl font-semibold text-theme-text">
            Upload Overlay File
          </h2>
        </div>

        <div className="border-2 border-dashed border-theme rounded-lg p-8 text-center">
          <input
            type="file"
            id="file-upload"
            accept="image/png,image/jpeg,image/jpg,.ttf,.otf,.woff,.woff2"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
          <label
            htmlFor="file-upload"
            className={`cursor-pointer ${uploading ? "opacity-50" : ""}`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-theme-primary/10 rounded-full flex items-center justify-center">
                {uploading ? (
                  <div className="w-8 h-8 border-4 border-theme-primary border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Upload className="w-8 h-8 text-theme-primary" />
                )}
              </div>
              <div>
                <p className="text-theme-text font-medium mb-1">
                  {uploading ? "Uploading..." : "Click to upload a file"}
                </p>
                <p className="text-theme-muted text-sm">
                  Images: PNG, JPEG (max 10MB) | Fonts: TTF, OTF, WOFF, WOFF2
                </p>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Files List */}
      <div className="bg-theme-card border border-theme rounded-lg p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FileImage className="w-5 h-5 text-theme-primary" />
            <h2 className="text-xl font-semibold text-theme-text">
              Overlay Files
            </h2>
            <span className="px-2 py-1 bg-theme-primary/10 text-theme-primary text-sm font-medium rounded">
              {filteredFiles.length}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Buttons */}
            <div className="flex items-center gap-2 bg-theme-hover rounded-lg p-1">
              <button
                onClick={() => setFilterType("all")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filterType === "all"
                    ? "bg-theme-primary text-white"
                    : "text-theme-muted hover:text-theme-text"
                }`}
              >
                All ({files.length})
              </button>
              <button
                onClick={() => setFilterType("image")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filterType === "image"
                    ? "bg-theme-primary text-white"
                    : "text-theme-muted hover:text-theme-text"
                }`}
              >
                Images ({imageCount})
              </button>
              <button
                onClick={() => setFilterType("font")}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filterType === "font"
                    ? "bg-theme-primary text-white"
                    : "text-theme-muted hover:text-theme-text"
                }`}
              >
                Fonts ({fontCount})
              </button>
            </div>

            <button
              onClick={loadFiles}
              disabled={loading}
              className="px-4 py-2 bg-theme-primary/10 hover:bg-theme-primary/20 text-theme-primary rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-theme-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12">
            {filterType === "all" ? (
              <>
                <ImageIcon className="w-16 h-16 text-theme-muted mx-auto mb-4 opacity-50" />
                <p className="text-theme-muted text-lg mb-2">
                  No overlay files found
                </p>
                <p className="text-theme-muted text-sm">
                  Upload your first overlay file to get started
                </p>
              </>
            ) : (
              <>
                {filterType === "image" ? (
                  <ImageIcon className="w-16 h-16 text-theme-muted mx-auto mb-4 opacity-50" />
                ) : (
                  <Type className="w-16 h-16 text-theme-muted mx-auto mb-4 opacity-50" />
                )}
                <p className="text-theme-muted text-lg mb-2">
                  No {filterType} files found
                </p>
                <p className="text-theme-muted text-sm">
                  Upload a {filterType} file or change the filter
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredFiles.map((file) => (
              <div
                key={file.name}
                className="bg-theme-card border-2 border-theme rounded-lg overflow-hidden group hover:border-theme-primary hover:shadow-lg hover:shadow-theme-primary/20 transition-all duration-300"
              >
                {/* Image/Font Preview */}
                <div className="aspect-square relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900">
                  {file.type === "image" ? (
                    <div className="w-full h-full p-4 flex items-center justify-center relative">
                      {/* Checkered background for transparency */}
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `
                          linear-gradient(45deg, #3a3a3a 25%, transparent 25%),
                          linear-gradient(-45deg, #3a3a3a 25%, transparent 25%),
                          linear-gradient(45deg, transparent 75%, #3a3a3a 75%),
                          linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)
                        `,
                          backgroundSize: "20px 20px",
                          backgroundPosition:
                            "0 0, 0 10px, 10px -10px, -10px 0px",
                        }}
                      ></div>
                      <img
                        src={`/api/overlayfiles/preview/${file.name}`}
                        alt={file.name}
                        className="relative z-10 max-w-full max-h-full object-contain drop-shadow-lg transition-transform duration-300 group-hover:scale-110"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4">
                      <Type className="w-16 h-16 text-theme-primary mb-2" />
                      <p className="text-theme-muted text-sm text-center">
                        {file.extension.toUpperCase()} Font
                      </p>
                    </div>
                  )}
                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                    {file.type === "image" && (
                      <button
                        onClick={() => setPreviewFile(file)}
                        className="p-3 bg-theme-primary hover:bg-theme-primary/80 rounded-lg transition-all hover:scale-110 shadow-lg"
                        title="Preview"
                      >
                        <Eye className="w-6 h-6 text-white" />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteConfirm(file)}
                      className="p-3 bg-red-500 hover:bg-red-600 rounded-lg transition-all hover:scale-110 shadow-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-6 h-6 text-white" />
                    </button>
                    <a
                      href={`/api/overlayfiles/preview/${file.name}`}
                      download={file.name}
                      className="p-3 bg-green-500 hover:bg-green-600 rounded-lg transition-all hover:scale-110 shadow-lg inline-block"
                      title="Download"
                    >
                      <Download className="w-6 h-6 text-white" />
                    </a>
                  </div>
                </div>

                {/* File Info */}
                <div className="p-3 bg-theme-hover border-t border-theme">
                  <p
                    className="text-theme-text text-sm font-medium truncate mb-1"
                    title={file.name}
                  >
                    {file.name}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 bg-theme-primary/10 text-theme-primary text-xs font-semibold rounded">
                      {getFileExtension(file.name)}
                    </span>
                    <span className="text-theme-muted text-xs font-medium">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="bg-theme-card border border-theme rounded-lg max-w-3xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-theme sticky top-0 bg-theme-card z-10">
              <div className="flex items-center gap-3">
                <ImageIcon className="w-5 h-5 text-theme-primary" />
                <h3 className="text-lg font-semibold text-theme-text">
                  Image Preview
                </h3>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="p-2 hover:bg-theme-hover rounded-lg transition-all"
              >
                <X className="w-5 h-5 text-theme-text" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-theme-muted mb-1">Filename:</p>
                <p className="text-theme-text font-mono bg-theme-bg px-3 py-2 rounded-lg border border-theme">
                  {previewFile.name}
                </p>
              </div>

              {/* Image Preview with Checkered Background */}
              <div className="relative bg-theme-bg rounded-lg border border-theme p-4 flex items-center justify-center overflow-hidden">
                {/* Checkered background for transparency */}
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    backgroundImage: `
                      linear-gradient(45deg, #3a3a3a 25%, transparent 25%),
                      linear-gradient(-45deg, #3a3a3a 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, #3a3a3a 75%),
                      linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)
                    `,
                    backgroundSize: "20px 20px",
                    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                  }}
                ></div>
                <img
                  src={`/api/overlayfiles/preview/${previewFile.name}`}
                  alt={previewFile.name}
                  className="relative z-10 max-w-full h-auto object-contain rounded-lg shadow-lg"
                  style={{ maxHeight: "55vh" }}
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "flex";
                  }}
                />
                <div
                  className="hidden flex-col items-center gap-3 text-theme-muted relative z-10"
                  style={{ display: "none" }}
                >
                  <AlertCircle className="w-12 h-12" />
                  <p>Failed to load image</p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="mt-4 flex justify-end gap-3">
                <button
                  onClick={() => setPreviewFile(null)}
                  className="px-4 py-2 bg-theme-bg hover:bg-theme-hover border border-theme rounded-lg font-medium transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="bg-theme-card border border-theme rounded-lg max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-theme-text mb-2">
                  Delete File
                </h3>
                <p className="text-theme-muted text-sm mb-1">
                  Are you sure you want to delete this file?
                </p>
                <p className="text-theme-text font-medium text-sm">
                  {deleteConfirm.name}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-theme-hover hover:bg-theme-dark text-theme-text rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.name)}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverlayAssets;
