import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Plus, LogOut, RefreshCw, Users, Trash2, ArrowRight, Pencil } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [memberships, setMemberships] = useState([]);
  const [tenantId, setTenantId] = useState(localStorage.getItem('tenantId') || '');
  const [boards, setBoards] = useState([]);
  const [activeBoard, setActiveBoard] = useState('');
  const [tasks, setTasks] = useState([]);
  const [columns, setColumns] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [auth, setAuth] = useState({ name: '', email: '', password: '', organizationName: '', tenantName: '' });
  const [newTask, setNewTask] = useState('');
  const [editing, setEditing] = useState(null);

  const client = useMemo(() => axios.create({ baseURL: API }), []);
  const tenant = memberships.find(m => m.tenantId === tenantId)?.tenant;

  function headers() { return { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId }; }

  async function loadWorkspace(tid = tenantId, tok = token) {
    if (!tok || !tid) return;
    const h = { Authorization: `Bearer ${tok}`, 'X-Tenant-Id': tid };
    const [b, t] = await Promise.all([client.get('/boards', { headers: h }), client.get('/tasks', { headers: h })]);
    setBoards(b.data);
    setTasks(t.data);
    if (b.data.length) {
      const board = b.data.find(x => x.id === activeBoard) || b.data[0];
      setActiveBoard(board.id);
      setColumns(board.columns || []);
    } else { setColumns([]); }
  }

  async function loadMe(tok) {
    const res = await client.get('/auth/me', { headers: { Authorization: `Bearer ${tok}` } });
    setUser(res.data.user); setMemberships(res.data.memberships);
    const tid = res.data.memberships[0]?.tenantId;
    if (tid) { setTenantId(tid); localStorage.setItem('tenantId', tid); await loadWorkspace(tid, tok); }
  }

  useEffect(() => {
    if (token) loadMe(token).catch(e => setError(e.response?.data?.message || 'Could not load account'));
  }, [token]);

  useEffect(() => {
    if (!token || !tenantId) return;
    const socket = io(SOCKET, { auth: { token, tenantId } });
    socket.on('task:created', task => setTasks(prev => prev.some(t => t.id === task.id) ? prev : [...prev, task]));
    socket.on('task:updated', task => setTasks(prev => prev.map(t => t.id === task.id ? task : t)));
    socket.on('task:moved', task => setTasks(prev => prev.map(t => t.id === task.id ? task : t)));
    socket.on('task:deleted', ({ id }) => setTasks(prev => prev.filter(t => t.id !== id)));
    socket.on('presence:update', data => setOnlineIds(data.onlineUserIds || []));
    socket.on('connect_error', err => setError(`Live connection: ${err.message}`));
    return () => socket.disconnect();
  }, [token, tenantId]);

  async function submitAuth(e) {
    e.preventDefault(); setError('');
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const res = await client.post(endpoint, auth);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setToken(res.data.token); setUser(res.data.user);
      if (res.data.tenant?.id) {
        setTenantId(res.data.tenant.id); localStorage.setItem('tenantId', res.data.tenant.id);
        setMemberships([{ tenantId: res.data.tenant.id, tenant: res.data.tenant, organization: res.data.organization, role: 'ORG_ADMIN' }]);
      } else {
        setMemberships(res.data.memberships || []);
        const tid = res.data.memberships?.[0]?.tenantId;
        if (tid) { setTenantId(tid); localStorage.setItem('tenantId', tid); }
      }
    } catch (e) { setError(e.response?.data?.message || 'Authentication failed'); }
  }

  function logout() {
    localStorage.clear(); setToken(''); setUser(null); setMemberships([]); setBoards([]); setTasks([]); setTenantId('');
  }

  async function createTask(e, columnId) {
    e.preventDefault(); if (!newTask.trim()) return;
    try {
      const boardId = activeBoard;
      const res = await client.post('/tasks', { title: newTask, boardId, columnId }, { headers: headers() });
      setTasks(prev => [...prev.filter(t => t.id !== res.data.id), res.data]); setNewTask('');
    } catch (e) { setError(e.response?.data?.message || 'Could not create task'); }
  }

  async function moveTask(task, direction) {
    const index = columns.findIndex(c => c.id === task.columnId);
    const target = columns[index + direction];
    if (!target) return;
    try {
      const res = await client.patch(`/tasks/${task.id}/move`, { columnId: target.id, position: 0, version: task.version }, { headers: headers() });
      setTasks(prev => prev.map(t => t.id === task.id ? res.data : t));
    } catch (e) {
      setError(e.response?.status === 409 ? 'Conflict detected. Reloading latest board…' : (e.response?.data?.message || 'Move failed'));
      await loadWorkspace();
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    try {
      const res = await client.put(`/tasks/${editing.id}`, { title: editing.title, description: editing.description, version: editing.version }, { headers: headers() });
      setTasks(prev => prev.map(t => t.id === res.data.id ? res.data : t)); setEditing(null);
    } catch (e) {
      setError(e.response?.status === 409 ? 'Conflict: another user changed this task. Latest board loaded.' : 'Update failed');
      setEditing(null); await loadWorkspace();
    }
  }

  async function deleteTask(task) {
    if (!confirm('Delete this task?')) return;
    try { await client.delete(`/tasks/${task.id}`, { headers: headers() }); setTasks(prev => prev.filter(t => t.id !== task.id)); }
    catch (e) { setError(e.response?.data?.message || 'Delete failed'); }
  }

  async function switchTenant(id) {
    setTenantId(id); localStorage.setItem('tenantId', id);
    try { await loadWorkspace(id); } catch (e) { setError(e.response?.data?.message || 'Could not switch tenant'); }
  }

  if (!token || !user) return <main className="auth-page"><form className="auth-card" onSubmit={submitAuth}>
    <div className="brand-mark">J</div><p className="eyebrow">JULLEYONLINE KANBAN</p><h1>{authMode === 'login' ? 'Welcome back' : 'Create your workspace'}</h1>
    {authMode === 'register' && <><input placeholder="Your name" value={auth.name} onChange={e => setAuth({ ...auth, name: e.target.value })} required/><input placeholder="Organization name" value={auth.organizationName} onChange={e => setAuth({ ...auth, organizationName: e.target.value })}/><input placeholder="Branch / tenant name" value={auth.tenantName} onChange={e => setAuth({ ...auth, tenantName: e.target.value })}/></>}
    <input type="email" placeholder="Email address" value={auth.email} onChange={e => setAuth({ ...auth, email: e.target.value })} required/>
    <input type="password" placeholder="Password (minimum 8 characters)" value={auth.password} onChange={e => setAuth({ ...auth, password: e.target.value })} required/>
    {error && <p className="error">{error}</p>}
    <button className="primary">{authMode === 'login' ? 'Sign in' : 'Create account'}</button>
    <p className="switch">{authMode === 'login' ? "New here?" : 'Already registered?'} <button type="button" className="link" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setError(''); }}>{authMode === 'login' ? 'Create account' : 'Sign in'}</button></p>
  </form></main>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark small">K</span><div><b>Kanban</b><small>WORKSPACE</small></div></div>
      <p className="nav-label">WORKSPACE</p>
      <label className="select-label">Organization / Branch</label>
      <select value={tenantId} onChange={e => switchTenant(e.target.value)}>{memberships.map(m => <option key={m.tenantId} value={m.tenantId}>{m.organization?.name} · {m.tenant?.name}</option>)}</select>
      <p className="nav-label">BOARDS</p>
      {boards.map(b => <button key={b.id} className={`board-link ${activeBoard === b.id ? 'selected' : ''}`} onClick={() => { setActiveBoard(b.id); setColumns(b.columns || []); }}>▦ {b.name}</button>)}
      <div className="sidebar-bottom"><div className="avatar">{user.name?.[0]?.toUpperCase()}</div><div className="user-info"><b>{user.name}</b><small>{user.email}</small></div><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={17}/></button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><p className="eyebrow">PROJECT MANAGEMENT / BOARD</p><h1>{boards.find(b => b.id === activeBoard)?.name || 'Your board'}</h1></div><div className="top-actions"><span className="online"><i/> {onlineIds.length} online</span><button className="secondary" onClick={() => loadWorkspace()}><RefreshCw size={15}/> Refresh</button></div></header>
      {error && <div className="notice"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
      <section className="board-meta"><span>{tenant?.name || 'Selected branch'} workspace</span><span className="role-chip">{memberships.find(m => m.tenantId === tenantId)?.role?.replace('_', ' ') || 'MEMBER'}</span><span className="muted">{tasks.length} tasks</span></section>
      <section className="kanban">
        {columns.map((column, i) => <div className="column" key={column.id}>
          <div className="column-head"><div><span className={`dot dot-${i%3}`}/><b>{column.name}</b><span className="count">{tasks.filter(t => t.columnId === column.id).length}</span></div></div>
          <form className="add-task" onSubmit={e => createTask(e, column.id)}><input value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Add a task…"/><button title="Add task"><Plus size={17}/></button></form>
          {tasks.filter(t => t.columnId === column.id).map(task => <article className="task-card" key={task.id}>
            <div className="task-top"><span className="task-tag">TASK</span><button className="icon-button" onClick={() => deleteTask(task)} title="Delete"><Trash2 size={14}/></button></div>
            <h3>{task.title}</h3><p>{task.description || 'No description added.'}</p>
            <div className="task-footer"><span>v{task.version}</span><div className="task-actions"><button onClick={() => setEditing(task)} title="Edit"><Pencil size={14}/></button><button disabled={i===0} onClick={() => moveTask(task,-1)} title="Move left"><ArrowRight className="left-arrow" size={14}/></button><button disabled={i===columns.length-1} onClick={() => moveTask(task,1)} title="Move right"><ArrowRight size={14}/></button></div></div>
          </article>)}
        </div>)}
      </section>
    </main>
    {editing && <div className="modal-backdrop"><form className="edit-modal" onSubmit={saveEdit}><h2>Edit task</h2><label>Title<input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}/></label><label>Description<textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })}/></label><p className="muted">Version {editing.version} · stale edits are rejected by the server.</p><div className="modal-actions"><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary">Save changes</button></div></form></div>}
  </div>;
}
