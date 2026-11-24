import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Select } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';
import { passwordError } from '../../data/stores';

type UserRow = Awaited<ReturnType<typeof api.users>>[number];
type Role = UserRow['roleKey'];

const STATUS_VARIANT = { Activo: 'success' as const, Pendiente: 'warning' as const, Inactivo: 'danger' as const };
const ROLE_VARIANT = { Comerciante: 'default' as const, Administrador: 'info' as const, Analista: 'info' as const };

export function AdminUsuarios() {
  const { showToast, ToastComponent } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'comerciante' as 'comerciante' | 'admin' | 'analista',
    storeId: '',
  });
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<{ id: string; name: string; role: Role; storeId: string } | null>(null);
  const [managing, setManaging] = useState<UserRow | null>(null);

  async function handleEdit() {
    if (!editing) return;
    try {
      await api.updateUser(editing.id, { name: editing.name, role: editing.role, storeId: editing.storeId || null });
      setUsers(await api.users());
      setEditing(null);
      showToast('Usuario actualizado. Los permisos aplican de inmediato.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo actualizar.');
    }
  }

  useEffect(() => {
    api
      .users()
      .then(setUsers)
      .finally(() => setLoading(false));
    api.stores().then(list => setStoreOptions(list.map(s => ({ id: s.id, name: s.name })))).catch(() => {});
  }, []);

  async function handleCreate() {
    const pwErr = passwordError(form.password);
    if (pwErr) return showToast(pwErr);
    if (form.role === 'comerciante' && !form.storeId) return showToast('Selecciona el comercio del comerciante.');
    setCreating(true);
    try {
      await api.createUser({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        storeId: form.storeId || undefined,
      });
      const list = await api.users();
      setUsers(list);
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'comerciante', storeId: '' });
      showToast('Usuario creado.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo crear el usuario.');
    } finally {
      setCreating(false);
    }
  }

  // Cuentas reales primero; las de los comercios de prueba al final.
  const isTestAccount = (u: UserRow) => u.store.includes('(PRUEBA)');
  const filtered = users
    .filter(
      u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => Number(isTestAccount(a)) - Number(isTestAccount(b)));

  async function toggleStatus(id: string, current: string) {
    const next = current === 'Activo' ? 'Inactivo' : 'Activo';
    try {
      await api.updateUserStatus(id, next as 'Activo' | 'Inactivo');
      setUsers(await api.users());
      showToast('Estado de usuario actualizado.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al actualizar.');
    }
  }

  const [tempPassword, setTempPassword] = useState<{ name: string; email: string; password: string } | null>(null);

  async function resetPassword(u: UserRow) {
    if (!confirm(`¿Generar una contraseña temporal para ${u.name}? La actual dejará de funcionar.`)) return;
    try {
      const { temporaryPassword } = await api.resetPassword(u.id);
      setTempPassword({ name: u.name, email: u.email, password: temporaryPassword });
      setUsers(await api.users());
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo restablecer la contraseña.');
    }
  }

  async function unlock(id: string) {
    try {
      await api.updateUserStatus(id, 'Activo');
      setUsers(await api.users());
      showToast('Cuenta desbloqueada.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al desbloquear.');
    }
  }

  if (loading) {
    return <div className="text-center py-20 text-slate-500">Cargando usuarios…</div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <ToastComponent />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestión de usuarios</h1>
          <p className="text-sm text-slate-500">{users.length} usuarios registrados</p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Crear usuario</Button>
      </div>

      <Input placeholder="Buscar usuario…" value={search} onChange={e => setSearch(e.target.value)} />

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {filtered.map(u => (
          <div key={u.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-900 flex items-center gap-2 flex-wrap">
                <span className="break-words">{u.name}</span>
                <Badge variant={ROLE_VARIANT[u.role as keyof typeof ROLE_VARIANT] || 'default'}>{u.role}</Badge>
                {u.status !== 'Activo' && (
                  <Badge variant={STATUS_VARIANT[u.status as keyof typeof STATUS_VARIANT] || 'default'}>{u.status}</Badge>
                )}
                {u.locked && <Badge variant="danger">🔒 Bloqueado</Badge>}
              </div>
              <div className="text-xs text-slate-500 break-all">{u.email}</div>
              <div className="text-xs text-slate-400">
                {u.store !== '—' && `${u.store} · `}Último acceso: {u.lastAccess}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setManaging(u)}>Administrar</Button>
          </div>
        ))}
        {filtered.length === 0 && <p className="p-4 text-sm text-slate-500">No hay usuarios que coincidan con la búsqueda.</p>}
      </div>

      {managing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="max-w-sm w-full space-y-2">
            <h2 className="font-semibold text-lg">{managing.name}</h2>
            <p className="text-xs text-slate-500 break-all">{managing.email}</p>
            <div className="grid gap-2 pt-2">
              {managing.locked && (
                <Button variant="outline" className="w-full" onClick={() => { const u = managing; setManaging(null); void unlock(u.id); }}>
                  🔓 Desbloquear cuenta
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const u = managing;
                  setManaging(null);
                  setEditing({ id: u.id, name: u.name, role: u.roleKey, storeId: u.storeId ?? '' });
                }}
              >
                ✏️ Editar nombre, rol o comercio
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { const u = managing; setManaging(null); void resetPassword(u); }}>
                🔑 Generar contraseña temporal
              </Button>
              <Button
                variant={managing.status === 'Activo' ? 'danger' : 'primary'}
                className="w-full"
                onClick={() => { const u = managing; setManaging(null); void toggleStatus(u.id, u.status); }}
              >
                {managing.status === 'Activo' ? 'Desactivar cuenta' : 'Activar cuenta'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setManaging(null)}>Cerrar</Button>
            </div>
          </Card>
        </div>
      )}

      {tempPassword && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full space-y-3">
            <h2 className="font-semibold text-lg">Contraseña temporal generada</h2>
            <p className="text-sm text-slate-600">
              Entrégale a <strong>{tempPassword.name}</strong> ({tempPassword.email}) esta contraseña. Al ingresar, el sistema le
              pedirá crear una nueva. No se volverá a mostrar.
            </p>
            <div className="p-3 bg-slate-100 rounded-lg font-mono text-lg text-center select-all">{tempPassword.password}</div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(tempPassword.password).then(() => showToast('Copiada.'))}
              >
                Copiar
              </Button>
              <Button onClick={() => setTempPassword(null)}>Listo</Button>
            </div>
          </Card>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full space-y-3">
            <h2 className="font-semibold text-lg">Editar usuario</h2>
            <Input label="Nombre" value={editing.name} onChange={e => setEditing(x => x && { ...x, name: e.target.value })} />
            <Select label="Rol" value={editing.role} onChange={e => setEditing(x => x && { ...x, role: e.target.value as Role })}>
              <option value="comerciante">Comerciante</option>
              <option value="admin">Administrador</option>
              <option value="analista">Analista</option>
            </Select>
            <Select label="Comercio" value={editing.storeId} onChange={e => setEditing(x => x && { ...x, storeId: e.target.value })}>
              <option value="">Sin comercio</option>
              {storeOptions.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button onClick={handleEdit}>Guardar cambios</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </Card>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full space-y-3">
            <h2 className="font-semibold text-lg">Crear usuario</h2>
            <Input label="Nombre" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input label="Correo" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Input
              label="Contraseña inicial"
              type="password"
              hint="Mínimo 8 caracteres, con letras y números. Entrégasela al usuario; podrá cambiarla en Configuración."
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
            <Select label="Rol" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as typeof form.role }))}>
              <option value="comerciante">Comerciante</option>
              <option value="admin">Administrador</option>
              <option value="analista">Analista</option>
            </Select>
            <Select
              label={form.role === 'comerciante' ? 'Comercio (obligatorio)' : 'Comercio (opcional)'}
              value={form.storeId}
              onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}
            >
              <option value="">{form.role === 'comerciante' ? 'Selecciona el comercio…' : 'Sin comercio'}</option>
              {storeOptions.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Button onClick={handleCreate} loading={creating}>Guardar</Button>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
