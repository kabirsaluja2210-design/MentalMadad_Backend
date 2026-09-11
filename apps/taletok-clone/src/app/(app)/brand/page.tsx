import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { BrandForm } from '@/components/brand-form';

export const dynamic = 'force-dynamic';

export default async function BrandPage() {
  const user = await requireUser();

  const brandKit =
    (await db.brandKit.findUnique({ where: { workspaceId: user.workspaceId } })) ??
    (await db.brandKit.create({ data: { workspaceId: user.workspaceId } }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Brand kit</h1>
        <p className="mt-1 text-slate-400">
          Applied to every render in this workspace — watermark, caption treatment and colours.
        </p>
      </header>
      <BrandForm
        brandKit={{
          watermarkText: brandKit.watermarkText, watermarkPos: brandKit.watermarkPos,
          watermarkOpacity: brandKit.watermarkOpacity, primaryColor: brandKit.primaryColor,
          captionStyle: brandKit.captionStyle, captionColor: brandKit.captionColor,
          captionHighlight: brandKit.captionHighlight, outroText: brandKit.outroText,
        }}
      />
    </div>
  );
}
