import { Stack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Text";
import { Grid } from "./Grid";
import { UpgradesMock } from "./UpgradesMock";

export function App() {
  if (new URLSearchParams(window.location.search).get("mock") === "upgrades") {
    return <UpgradesMock />;
  }
  return (
    <Stack direction="vertical" gap={4}>
      <Heading level={1}>Last Mile</Heading>
      <Grid />
    </Stack>
  );
}
