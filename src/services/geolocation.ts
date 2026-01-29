export type GeoPosition = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};

export type GeoErrorCode =
  | "PERMISSION_DENIED"
  | "POSITION_UNAVAILABLE"
  | "TIMEOUT"
  | "UNSUPPORTED"
  | "UNKNOWN";

export type GeoError = {
  code: GeoErrorCode;
  message: string;
  raw?: unknown;
};

export type GeoOptions = {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
};

const defaultOptions: Required<GeoOptions> = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 12000,
};

const buildError = (code: GeoErrorCode, message: string, raw?: unknown): GeoError => ({
  code,
  message,
  raw,
});

const mapNativeError = (error: GeolocationPositionError): GeoError => {
  switch (error.code) {
    case 1:
      return buildError(
        "PERMISSION_DENIED",
        "Permissao de localizacao negada. Ative a localizacao para registrar o atendimento.",
        error
      );
    case 2:
      return buildError(
        "POSITION_UNAVAILABLE",
        "Nao foi possivel obter a localizacao. Verifique o GPS e tente novamente.",
        error
      );
    case 3:
      return buildError(
        "TIMEOUT",
        "Tempo esgotado ao capturar a localizacao. Tente novamente.",
        error
      );
    default:
      return buildError(
        "UNKNOWN",
        "Nao foi possivel capturar a localizacao. Tente novamente.",
        error
      );
  }
};

export const normalizeGeoError = (error: unknown): GeoError => {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const typed = error as GeoError;
    return {
      code: typed.code ?? "UNKNOWN",
      message: typed.message ?? "Nao foi possivel capturar a localizacao.",
      raw: typed.raw,
    };
  }

  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "number"
  ) {
    return mapNativeError(error as GeolocationPositionError);
  }

  return buildError(
    "UNKNOWN",
    "Nao foi possivel capturar a localizacao. Tente novamente.",
    error
  );
};

export const getCurrentPosition = async (
  options: GeoOptions = {}
): Promise<GeoPosition> => {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw buildError(
      "UNSUPPORTED",
      "Geolocalizacao nao disponivel neste dispositivo."
    );
  }

  const settings = {
    ...defaultOptions,
    ...options,
  };

  return new Promise<GeoPosition>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        buildError(
          "TIMEOUT",
          "Tempo esgotado ao capturar a localizacao. Tente novamente."
        )
      );
    }, settings.timeout);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        reject(mapNativeError(error));
      },
      {
        enableHighAccuracy: settings.enableHighAccuracy,
        maximumAge: settings.maximumAge,
        timeout: settings.timeout,
      }
    );
  });
};
