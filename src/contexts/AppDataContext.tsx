/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
  type MaintenanceDataContextValue,
  useMaintenanceData,
} from "../hooks/useMaintenanceData";
import {
  type WarrantyDataContextValue,
  useWarrantyData,
} from "../hooks/useWarrantyData";

const MaintenanceDataContext =
  createContext<MaintenanceDataContextValue | null>(null);
const WarrantyDataContext = createContext<WarrantyDataContextValue | null>(
  null
);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const maintenance = useMaintenanceData();
  const warranty = useWarrantyData();

  return (
    <MaintenanceDataContext.Provider value={maintenance}>
      <WarrantyDataContext.Provider value={warranty}>
        {children}
      </WarrantyDataContext.Provider>
    </MaintenanceDataContext.Provider>
  );
}

export function useMaintenanceContext() {
  const ctx = useContext(MaintenanceDataContext);
  if (!ctx)
    throw new Error("useMaintenanceContext must be within AppDataProvider");
  return ctx;
}

export function useWarrantyContext() {
  const ctx = useContext(WarrantyDataContext);
  if (!ctx)
    throw new Error("useWarrantyContext must be within AppDataProvider");
  return ctx;
}
