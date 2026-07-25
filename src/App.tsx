import { useState } from "react";
import { Stack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Text";
import { Grid } from "./Grid";

export function App() {
  const [cash, setCash] = useState(0);
  return (
    <Stack direction="vertical" gap={4}>
      <Heading level={1}>Last Mile</Heading>
      <Grid cash={cash} onEarn={(delta) => setCash((c) => c + delta)} />
    </Stack>
  );
}
