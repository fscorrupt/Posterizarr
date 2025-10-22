import { useCallback } from "react";
import { useApi } from "../context/ApiContext";
import { useToast } from "../context/ToastContext";

/**
 * Hook für Asset-Management mit automatischen Cache-Updates
 * Sorgt dafür dass alle Components instant aktualisiert werden
 */
export const useAssetManager = () => {
  const api = useApi();
  const { showSuccess, showError } = useToast();

  /**
   * Upload ein neues Asset
   * Automatisches Cache-Invalidation und UI-Update in allen Components
   */
  const uploadAsset = useCallback(
    async (endpoint, formData, options = {}) => {
      const { 
        successMessage = "Asset uploaded successfully",
        errorMessage = "Failed to upload asset",
        silent = false 
      } = options;

      try {
        const result = await api.uploadAsset(endpoint, formData);

        if (!silent) {
          showSuccess(successMessage);
        }

        // Trigger automatic refetch in all subscribed components
        // This happens automatically through the ApiContext

        return result;
      } catch (error) {
        console.error("[useAssetManager] Upload error:", error);
        if (!silent) {
          showError(errorMessage);
        }
        throw error;
      }
    },
    [api, showSuccess, showError]
  );

  /**
   * Delete ein Asset
   * Automatisches Cache-Invalidation und UI-Update
   */
  const deleteAsset = useCallback(
    async (endpoint, options = {}) => {
      const {
        successMessage = "Asset deleted successfully",
        errorMessage = "Failed to delete asset",
        silent = false,
      } = options;

      try {
        const result = await api.deleteAsset(endpoint);

        if (!silent) {
          showSuccess(successMessage);
        }

        return result;
      } catch (error) {
        console.error("[useAssetManager] Delete error:", error);
        if (!silent) {
          showError(errorMessage);
        }
        throw error;
      }
    },
    [api, showSuccess, showError]
  );

  /**
   * Replace/Update ein Asset
   * Automatisches Cache-Invalidation und UI-Update
   */
  const replaceAsset = useCallback(
    async (endpoint, data, options = {}) => {
      const {
        successMessage = "Asset replaced successfully",
        errorMessage = "Failed to replace asset",
        silent = false,
      } = options;

      try {
        const result = await api.replaceAsset(endpoint, data);

        if (!silent) {
          showSuccess(successMessage);
        }

        return result;
      } catch (error) {
        console.error("[useAssetManager] Replace error:", error);
        if (!silent) {
          showError(errorMessage);
        }
        throw error;
      }
    },
    [api, showSuccess, showError]
  );

  /**
   * Bulk-Delete mehrere Assets
   * Automatisches Cache-Invalidation nach allen Deletes
   */
  const bulkDeleteAssets = useCallback(
    async (deleteOperations, options = {}) => {
      const {
        successMessage = "Assets deleted successfully",
        errorMessage = "Failed to delete some assets",
        silent = false,
      } = options;

      const results = [];
      const errors = [];

      for (const operation of deleteOperations) {
        try {
          const result = await deleteAsset(operation.endpoint, { silent: true });
          results.push({ ...operation, success: true, result });
        } catch (error) {
          errors.push({ ...operation, success: false, error });
        }
      }

      // Show summary
      if (!silent) {
        if (errors.length === 0) {
          showSuccess(successMessage);
        } else if (results.length > 0) {
          showError(
            `${results.length} assets deleted, ${errors.length} failed`
          );
        } else {
          showError(errorMessage);
        }
      }

      return { results, errors };
    },
    [deleteAsset, showSuccess, showError]
  );

  /**
   * Trigger global refresh aller Asset-Daten
   * Nützlich nach Bulk-Operations
   */
  const refreshAllAssets = useCallback(() => {
    api.refreshAssets();
    console.log("[useAssetManager] Triggered global asset refresh");
  }, [api]);

  return {
    uploadAsset,
    deleteAsset,
    replaceAsset,
    bulkDeleteAssets,
    refreshAllAssets,
  };
};
