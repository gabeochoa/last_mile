import { useEffect, useState } from "react";
import { Stack } from "@astryxdesign/core/Stack";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { createState, type GameState } from "./state";
import { load } from "./save";
import { tick } from "./loop";

export function App() {
  const [state, setState] = useState<GameState>(() => load() ?? createState());

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setState((s) => tick(s, dt));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // TODO(phase1): replace with the dispatch control-center layout (AppShell +
  // sidebar roster/orders + map region + top alert bar). This is a placeholder
  // proving the React + astryx stack renders and the loop ticks.
  return (
    <Stack direction="vertical" gap={4}>
      <Heading level={1}>Last Mile</Heading>
      <Text>Packages remaining: {Math.ceil(state.quotaRemaining)}</Text>
      <Text>Days until the Last Mile: {state.daysUntilLastMile}</Text>
      <Text>Humans remaining: {state.humansRemaining}</Text>
      <Text>Cash: ${Math.floor(state.cash)}</Text>
      <Button
        label="Advance day"
        onClick={() => setState((s) => ({ ...s, day: s.day + 1 }))}
      />
    </Stack>
  );
}
