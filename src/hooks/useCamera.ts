type CameraShot = {
  uri: string;
  takenAt: string;
};

export const useCamera = () => {
  return {
    status: "mock",
    lastShot: null as CameraShot | null,
    takePhoto: async () => ({
      uri: "/placeholder-camera.png",
      takenAt: new Date().toISOString(),
    }),
  };
};
