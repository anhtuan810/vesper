import * as Sentry from "@sentry/nextjs";
import { createServerSupabase } from "@/lib/supabase";
import { buildVitalsInputs } from "@/lib/vitals/build-inputs";
import { computeAllVitals } from "@/lib/vitals/index";

type SupabaseClient = ReturnType<typeof createServerSupabase>;

export async function writeVitalSnapshots(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { user, assets, snapshots } = await buildVitalsInputs(supabase, userId);

    const country: string | null = (user.country as string | null) ?? null;
    const vitals = computeAllVitals({ country }, assets, snapshots);

    for (const vital of vitals) {
      if (!vital.applies) continue;
      try {
        const { error } = await supabase.from("vital_snapshots").upsert(
          {
            user_id: userId,
            vital_key: vital.key,
            date: today,
            value: vital.value,
            band: vital.band,
          },
          { onConflict: "user_id,vital_key,date" },
        );
        if (error) throw error;
      } catch (err) {
        Sentry.captureException(err, {
          tags: { fn: "writeVitalSnapshots", vital_key: vital.key },
          extra: { user_id: userId },
        });
      }
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { fn: "writeVitalSnapshots" },
      extra: { user_id: userId },
    });
  }
}
