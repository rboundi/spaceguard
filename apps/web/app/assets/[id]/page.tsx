export default function AssetDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-slate-50">Asset Detail</h1>
      <p className="text-slate-400 mt-1">Asset ID: {params.id}</p>
    </div>
  );
}
