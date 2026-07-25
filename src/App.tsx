import { useState } from "react";
import { Theme } from "@astryxdesign/core";
import { HStack } from "@astryxdesign/core/Stack";
import { Grid } from "./Grid";
import { Upgrades, micrographic } from "./Upgrades";

const COSTS: Record<string, number> = { momentumDrive: 10 };

export function App() {
  const [cash, setCash] = useState(0);
  const [upgrades, setUpgrades] = useState<Record<string, number>>({});

  const onBuy = (id: string) => {
    const cost = COSTS[id];
    if (cost == null || cash < cost || (upgrades[id] ?? 0) > 0) return;
    setCash((c) => c - cost);
    setUpgrades((u) => ({ ...u, [id]: 1 }));
  };

  return (
    <Theme theme={micrographic} mode="dark">
      <HStack vAlign="start">
        <Upgrades cash={cash} upgrades={upgrades} onBuy={onBuy} />
        <Grid cash={cash} onEarn={(delta) => setCash((c) => c + delta)} />
      </HStack>
    </Theme>
  );
}
