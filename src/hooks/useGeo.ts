type GeoPosition = {
  lat: number;
  lng: number;
  accuracy: number;
};

export const useGeo = () => {
  const mockPosition: GeoPosition = {
    lat: -3.7319,
    lng: -38.5267,
    accuracy: 42,
  };

  return {
    status: "mock",
    position: mockPosition,
    request: async () => mockPosition,
  };
};
