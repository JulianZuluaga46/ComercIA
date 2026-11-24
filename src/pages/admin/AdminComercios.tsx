import { useEffect, useState } from 'react';
import { api, type ApiStore } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Select } from '../../components/ui/Input';
import { CATEGORIES } from '../../data/stores';
import { useToast } from '../../components/ui/Toast';

type Status = 'Activo' | 'Pendiente' | 'Inactivo';

const STATUS_VARIANT = {
  Activo: 'success' as const,
  Pendiente: 'warning' as const,
  Inactivo: 'danger' as const,
};

export function AdminComercios() {
  const { showToast, ToastComponent } = useToast();
  const [search, setSearch] = useState('');
  const [stores, setStores] = useState<ApiStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: CATEGORIES[0],
    address: '',
    employees: '3',
    yearsInBusiness: '5',
    avgDailyClients: '20',
  });

  useEffect(() => {
    api
      .stores()
      .then(setStores)
      .finally(() => setLoading(false));
  }, []);

  // Primero los pendientes de aprobación, luego los reales y al final los de prueba
  const rank = (s: { status?: string; isTest: boolean }) => (s.status === 'Pendiente' ? 0 : s.isTest ? 2 : 1);
  const filtered = stores
    .filter(
      s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  async function toggleStatus(id: string, current: Status) {
    const next: Status = current === 'Activo' ? 'Inactivo' : 'Activo';
    try {
      const updated = await api.updateStoreStatus(id, next);
      setStores(prev => prev.map(s => (s.id === id ? updated : s)));
      showToast('Estado actualizado.');
    } catch {
      showToast('Error al actualizar estado.');
    }
  }

  if (loading) {
    return <div className="text-center py-20 text-slate-500">Cargando comercios…</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <ToastComponent />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de comercios</h1>
          <p className="text-sm text-slate-500">{stores.length} comercios registrados</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Registrar comercio</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['Activo', 'Pendiente', 'Inactivo'] as Status[]).map(status => (
          <Card key={status} className="text-center">
            <div className="text-2xl font-bold text-slate-900">
              {stores.filter(s => s.status === status).length}
            </div>
            <div className="text-xs text-slate-500">{status}</div>
          </Card>
        ))}
        <Card className="text-center">
          <div className="text-2xl font-bold text-slate-900">
            {stores.filter(s => !s.isTest).reduce((a, s) => a + s.dataRecords, 0)}
          </div>
          <div className="text-xs text-slate-500">
            Registros reales
            {stores.some(s => s.isTest) && (
              <span className="block text-amber-600">
                + {stores.filter(s => s.isTest).reduce((a, s) => a + s.dataRecords, 0)} de prueba
              </span>
            )}
          </div>
        </Card>
      </div>

      <Input
        placeholder="Buscar por nombre o categoría…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Comercio</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Categoría</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Registros</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(store => {
              const status = (store.status || 'Activo') as Status;
              return (
                <tr key={store.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                      {store.name.replace(' (PRUEBA)', '')}
                      {store.isTest && <Badge variant="warning" size="sm">PRUEBA</Badge>}
                    </div>
                    <div className="text-xs text-slate-400 break-words">{store.address}</div>
                    <div className="sm:hidden mt-1"><Badge variant={STATUS_VARIANT[status]}>{status}</Badge></div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{store.category}</td>
                  <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{store.dataRecords}</td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant={status === 'Pendiente' ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => toggleStatus(store.id, status)}
                    >
                      {status === 'Activo' ? 'Desactivar' : status === 'Pendiente' ? 'Aprobar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full space-y-3">
            <h2 className="font-semibold text-lg">Registrar comercio</h2>
            <Input label="Nombre" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Select label="Categoría" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as typeof f.category }))}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </Select>
            <Input label="Dirección" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            <div className="grid grid-cols-3 gap-2">
              <Input label="Empleados" type="number" value={form.employees} onChange={e => setForm(f => ({ ...f, employees: e.target.value }))} />
              <Input label="Años" type="number" value={form.yearsInBusiness} onChange={e => setForm(f => ({ ...f, yearsInBusiness: e.target.value }))} />
              <Input label="Clientes/día" type="number" value={form.avgDailyClients} onChange={e => setForm(f => ({ ...f, avgDailyClients: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button
                loading={creating}
                onClick={async () => {
                  setCreating(true);
                  try {
                    const created = await api.createStore({
                      name: form.name,
                      category: form.category,
                      address: form.address,
                      employees: Number(form.employees),
                      yearsInBusiness: Number(form.yearsInBusiness),
                      avgDailyClients: Number(form.avgDailyClients),
                    });
                    setStores(prev => [...prev, created]);
                    setShowModal(false);
                    setForm({ name: '', category: CATEGORIES[0], address: '', employees: '3', yearsInBusiness: '5', avgDailyClients: '20' });
                    showToast('Comercio creado y activo. Ahora crea la cuenta de su comerciante en Usuarios.');
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : 'Error al crear comercio.');
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                Guardar
              </Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
