export default function DeniedPage() {
  return (
    <div className="min-h-screen bg-[#080E1C] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 bg-[#0D1525] border border-[#1A2035] rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-[#F2784B] font-bold text-xl">N</span>
        </div>
        <h1 className="text-xl font-semibold text-[#E8EEF8] mb-2">BeLive Nucleus</h1>

        <div className="bg-[#0D1525] border border-[#E05252]/20 rounded-xl p-6 mt-6">
          <p className="text-lg mb-4">🚫</p>
          <h2 className="text-sm font-medium text-[#E05252] mb-3">Access Denied</h2>
          <p className="text-xs text-[#8A9BB8] leading-relaxed">
            This is a private system for BeLive Group leadership only.
            Your Lark account does not have permission to access Nucleus.
          </p>
          <p className="text-xs text-[#4B5A7A] mt-4">
            If you believe this is an error, contact Lee Seng Hee directly.
          </p>
        </div>
      </div>
    </div>
  )
}
