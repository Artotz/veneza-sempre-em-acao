import { useEffect, useState } from "react";

const getInitialStatus = () => {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
};

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(getInitialStatus);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
};
