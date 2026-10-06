/**
 * `assemblyHoursColumnValue` for a router: the same one door for writing an
 * assembly's hours, with its refusal turned into a message the person saving
 * can read rather than a server error.
 */
import { TRPCError } from "@trpc/server";
import { AssemblyHoursNotSetUnsupported, assemblyHoursColumnValue } from "./db";

export function assemblyHoursToWrite(hours: number | null, what: string) {
  try {
    return assemblyHoursColumnValue(hours, what);
  } catch (error) {
    if (error instanceof AssemblyHoursNotSetUnsupported) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }
}
