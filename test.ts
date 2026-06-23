import { recoverMessageAddress } from "viem";
try {
  await recoverMessageAddress({ message: "test", signature: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" });
  console.log("recovered");
} catch (e) {
  console.error("error", e);
}
