import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { CATEGORIES } from '../../data/stores';
import { useToast } from '../../components/ui/Toast';
import { Badge } from '../../components/ui/Badge';
import { api } from '../../lib/api';

export function Perfil() {
  const { currentUser, currentStore, setCurrentStore, updateProfile, refreshStores } = useApp();
  const { showToast, ToastComponent } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: currentUser?.name ?? '',
    correo: currentUser?.email ?? '',
    telefono: currentUser?.phone ?? '',
    nombreComercio: currentStore.name,
    categoria: currentStore.category,
    direccion: currentStore.address,
    empleados: String(currentStore.employees),
    antiguedad: String(currentStore.yearsInBusiness),
  });

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({ name: form.nombre, phone: form.telefono });
      if (currentStore.id) {
        const updated = await api.updateStore(currentStore.id, {
          name: form.nombreComercio,
          category: form.categoria,
          address: form.direccion,
          employees: Number(form.empleados) || 0,
          yearsInBusiness: Number(form.antiguedad) || 0,
        });
        setCurrentStore({
          ...currentStore,
          name: updated.name,
          category: updated.category as typeof currentStore.category,
          address: updated.address,
          employees: updated.employees,
          yearsInBusiness: updated.yearsInBusiness,
        });
        await refreshStores();
      }
      setEditing(false);
      showToast('Cambios guardados.');
    } catch {
      showToast('No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <ToastComponent />
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi comercio y perfil</h1>
        <p className="text-sm text-slate-500">Información de tu cuenta y comercio registrado.</p>
      </div>

      {/* Profile card */}
      <Card>
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-2xl">🏪</div>
            <div>
              <h2 className="font-bold text-slate-900 text-lg">{form.nombreComercio}</h2>
              <div className="text-sm text-slate-500">{form.categoria} · Centro de Montería</div>
              <Badge
                variant={currentStore.status === 'Activo' ? 'success' : currentStore.status === 'Pendiente' ? 'warning' : 'danger'}
                className="mt-1"
              >
                {currentStore.status === 'Pendiente' ? 'Pendiente de aprobación' : currentStore.status}
              </Badge>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancelar' : '✏️ Editar'}
          </Button>
        </div>

        {editing ? (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Datos personales</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Nombre completo" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              <Input label="Correo electrónico" type="email" value={form.correo} disabled hint="Para cambiar el correo, contacta al administrador." />
              <Input label="Teléfono" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
            </div>
            <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide mt-4">Datos del comercio</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Nombre del comercio" value={form.nombreComercio} onChange={e => setForm(f => ({ ...f, nombreComercio: e.target.value }))} />
              <Select label="Categoría" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as any }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </Select>
              <Input label="Dirección" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} className="sm:col-span-2" />
              <Input label="N° de empleados" type="number" value={form.empleados} onChange={e => setForm(f => ({ ...f, empleados: e.target.value }))} />
              <Input label="Antigüedad (años)" type="number" value={form.antiguedad} onChange={e => setForm(f => ({ ...f, antiguedad: e.target.value }))} />
            </div>
            <Button onClick={handleSave} loading={saving}>Guardar cambios</Button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {[
              { label: 'Nombre', value: form.nombre },
              { label: 'Correo', value: form.correo },
              { label: 'Teléfono', value: form.telefono },
              { label: 'Nombre del comercio', value: form.nombreComercio },
              { label: 'Categoría', value: form.categoria },
              { label: 'Dirección', value: form.direccion },
              { label: 'Empleados', value: form.empleados },
              { label: 'Antigüedad', value: `${form.antiguedad} años` },
              { label: 'Días registrados', value: `${currentStore.dataRecords}` },
              { label: 'Promedio diario', value: `${currentStore.avgDailyClients} clientes` },
            ].map(row => (
              <div key={row.label} className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-500">{row.label}</span>
                <span className="font-medium text-slate-900">{row.value}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Data status */}
      <Card>
        <h2 className="font-semibold text-slate-900 mb-3">Datos para el modelo</h2>
        {(() => {
          const n = currentStore.dataRecords;
          const level = n >= 90 ? 'success' : n >= 28 ? 'warning' : 'danger';
          return (
            <>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">Días registrados</span>
                    <span className="font-semibold text-slate-900">{n} / 90 recomendados</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${level === 'success' ? 'bg-green-500' : level === 'warning' ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${Math.min(100, (n / 90) * 100)}%` }}
                    />
                  </div>
                </div>
                <Badge variant={level}>{level === 'success' ? 'Suficientes' : level === 'warning' ? 'Mínimo alcanzado' : 'Insuficientes'}</Badge>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Mínimo 28 días (4 semanas) para predicciones confiables; con 90 días o más el modelo capta mejor quincenas y
                temporadas. Registra el flujo cada día en «Datos».
              </p>
            </>
          );
        })()}
      </Card>
    </div>
  );
}
