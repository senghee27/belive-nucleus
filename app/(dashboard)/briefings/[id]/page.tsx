import { ReportDetail } from '@/components/briefings/ReportDetail'

export default async function BriefingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ReportDetail reportId={id} />
}
