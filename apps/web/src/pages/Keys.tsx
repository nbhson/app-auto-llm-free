export default function Keys() {
  return (
    <div>
      <h2>Virtual Keys</h2>
      <div className="card">
        <p>P1: Keys chưa lưu DB, dùng <code>MASTER_KEY</code> hoặc bất kỳ <code>fgk-*</code> trong dev.</p>
        <p>Trong P4 sẽ có CRUD thật: tạo <code>fgk-...</code> với scope model/provider, RPM/TPD limits.</p>
        <code>curl -X POST http://localhost:8080/api/keys -H "Authorization: Bearer $MASTER_KEY" -d '{"{"}name":"my-app"{"}"}'</code>
      </div>
    </div>
  );
}
