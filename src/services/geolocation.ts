import { t } from "../i18n";

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
        t(
          "ui.permissao_de_localizacao_negada_ative_a_localizacao_para_registrar_o_atendimento",
        ),
        error
      );
    case 2:
      return buildError(
        "POSITION_UNAVAILABLE",
        t(
          "ui.nao_foi_possivel_obter_a_localizacao_verifique_o_gps_e_tente_novamente",
        ),
        error
      );
    case 3:
      return buildError(
        "TIMEOUT",
        t("ui.tempo_esgotado_ao_capturar_a_localizacao_tente_novamente"),
        error
      );
    default:
      return buildError(
        "UNKNOWN",
        t("ui.nao_foi_possivel_capturar_a_localizacao_tente_novamente"),
        error
      );
  }
};

export const normalizeGeoError = (error: unknown): GeoError => {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const typed = error as GeoError;
    return {
      code: typed.code ?? "UNKNOWN",
      message: typed.message ?? t("ui.nao_foi_possivel_capturar_a_localizacao"),
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
    t("ui.nao_foi_possivel_capturar_a_localizacao_tente_novamente"),
    error
  );
};

export const getCurrentPosition = async (
  options: GeoOptions = {}
): Promise<GeoPosition> => {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw buildError(
      "UNSUPPORTED",
      t("ui.geolocalizacao_nao_disponivel_neste_dispositivo")
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
          t("ui.tempo_esgotado_ao_capturar_a_localizacao_tente_novamente")
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
