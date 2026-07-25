import { Stack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Text";
import { Grid } from "./Grid";

export function App() {
  return (
    <Stack direction="vertical" gap={4}>
      <Heading level={1}>Last Mile</Heading>
      <Grid />
    </Stack>
  );
}
