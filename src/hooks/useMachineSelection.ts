import { useEffect, useMemo, useRef, useState } from "react";
import { familyOrder, machinesByFamily } from "../utils/machines";

export function useMachineSelection(machines: string[]) {
  const initialFamily =
    (familyOrder as readonly string[]).find(
      (family) => machinesByFamily(machines, family).length > 0
    ) ?? machines[0] ?? "";
  const modelsForInitialFamily = machinesByFamily(machines, initialFamily);
  const initialModel = modelsForInitialFamily[0] ?? machines[0] ?? "";

  const [selectedFamily, setSelectedFamily] = useState<string>(initialFamily);
  const [selectedModel, setSelectedModel] = useState<string>(initialModel);

  const selectedFamilyRef = useRef(selectedFamily);
  const selectedModelRef = useRef(selectedModel);

  useEffect(() => {
    selectedFamilyRef.current = selectedFamily;
  }, [selectedFamily]);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    const fallbackFamily =
      (familyOrder as readonly string[]).find(
        (family) => machinesByFamily(machines, family).length > 0
      ) ?? machines[0] ?? "";

    const previousFamily = selectedFamilyRef.current;
    const nextFamily =
      previousFamily &&
      machinesByFamily(machines, previousFamily).length > 0
        ? previousFamily
        : fallbackFamily;

    if (nextFamily !== previousFamily) {
      setSelectedFamily(nextFamily);
    }

    const modelsForFamily = machinesByFamily(machines, nextFamily);
    const previousModel = selectedModelRef.current;
    const nextModel =
      previousModel && modelsForFamily.includes(previousModel)
        ? previousModel
        : modelsForFamily[0] ?? machines[0] ?? "";

    if (nextModel !== previousModel) {
      setSelectedModel(nextModel);
    }
  }, [machines]);

  useEffect(() => {
    const modelsForFamily = machinesByFamily(machines, selectedFamily);
    if (modelsForFamily.length === 0) return;
    if (!modelsForFamily.includes(selectedModel)) {
      setSelectedModel(modelsForFamily[0]);
    }
  }, [machines, selectedFamily, selectedModel]);

  const machinesBySelectedFamily = useMemo(
    () => machinesByFamily(machines, selectedFamily),
    [machines, selectedFamily]
  );

  return {
    selectedFamily,
    selectedModel,
    setSelectedFamily,
    setSelectedModel,
    machinesBySelectedFamily,
  };
}
