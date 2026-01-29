import { useCallback, useState } from "react";
import {
  getCurrentPosition,
  normalizeGeoError,
  type GeoError,
  type GeoOptions,
  type GeoPosition,
} from "../services/geolocation";

const isLikelyIOS = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
};

export const useGeolocation = () => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<GeoError | null>(null);
  const [lastPosition, setLastPosition] = useState<GeoPosition | null>(null);

  const capture = useCallback(async (options: GeoOptions = {}) => {
    setIsCapturing(true);
    setError(null);

    const primaryOptions: GeoOptions = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
      ...options,
    };

    try {
      const position = await getCurrentPosition(primaryOptions);
      setLastPosition(position);
      return position;
    } catch (error) {
      const normalized = normalizeGeoError(error);
      if (normalized.code === "TIMEOUT" && isLikelyIOS()) {
        try {
          const fallback = await getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 12000,
            maximumAge: 30000,
          });
          setLastPosition(fallback);
          return fallback;
        } catch (fallbackError) {
          const mapped = normalizeGeoError(fallbackError);
          setError(mapped);
          throw mapped;
        }
      }

      setError(normalized);
      throw normalized;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  return {
    capture,
    error,
    isCapturing,
    lastPosition,
    resetError,
  };
};
