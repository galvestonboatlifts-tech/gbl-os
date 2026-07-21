import React, { useEffect, useMemo, useState } from 'react'
import { supabase, isConfigured } from './lib/supabase'
import { money, dateText, today, id } from './lib/utils'
import { Badge, Empty, Field, Metric, Modal, SelectField } from './components/UI'

const modules = [
  ['dashboard', 'Dashboard'], ['customers', 'Customers'], ['properties', 'Properties'],
  ['estimates', 'Estimates'], ['jobs', 'Jobs'], ['invoices', 'Invoices'],
  ['inventory', 'Inventory'], ['employees', 'Employees'], ['maintenance', 'Maintenance'],
  ['reports', 'Reports'],
]

const emptyData = {
  customers: [], properties: [], estimates: [], jobs: [], invoices: [],
  inventory: [], employees: [], maintenance: [],
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [records, setRecords] = useState(emptyData)
  const [editor, setEditor] = useState(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')

  useEffect(() => {
    if (!isConfigured) return setLoading(false)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session) loadAll() }, [session])

  async function loadAll() {
    const next = {}
    for (const table of Object.keys(emptyData)) {
      const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false })
      if (error) console.error(table, error)
      next[table] = data || []
    }
    setRecords(next)
  }

  async function save(table, row) {
    const { error } = await supabase.from(table).upsert({ ...row, user_id: session.user.id })
    if (error) return alert(error.message)
    await loadAll()
    setEditor(null)
  }

  async function remove(table, recordId) {
    if (!confirm('Delete this record?')) return
    const { error } = await supabase.from(table).delete().eq('id', recordId)
    if (error) return alert(error.message)
    if (table === 'customers' && selectedCustomerId === recordId) setSelectedCustomerId(null)
    await loadAll()
  }

  if (loading) return <Splash text="Loading…" />
  if (!isConfigured) return <ConfigurationScreen />
  if (!session) return <AuthScreen />

  const customer = (recordId) => records.customers.find((x) => x.id === recordId)
  const property = (recordId) => records.properties.find((x) => x.id === recordId)
  const openEstimates = records.estimates.filter((x) => !['Accepted', 'Declined'].includes(x.status))
  const activeJobs = records.jobs.filter((x) => !['Completed', 'Cancelled'].includes(x.status))
  const receivables = records.invoices.reduce((sum, x) => sum + Number(x.total) - Number(x.paid), 0)
  const estimatedProfit = records.jobs.reduce((sum, x) => sum + Number(x.contract_amount) - Number(x.material_cost) - Number(x.labor_cost) - Number(x.other_cost), 0)

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase()
    if (!q) return records.customers
    return records.customers.filter((x) => [x.name, x.phone, x.email, x.preferred_contact, x.billing_address, x.notes]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(q)))
  }, [records.customers, customerSearch])

  async function convertEstimate(estimate) {
    const { error } = await supabase.from('jobs').insert({
      id: id(), user_id: session.user.id, customer_id: estimate.customer_id,
      property_id: estimate.property_id || null, estimate_id: estimate.id,
      number: `JOB-${String(records.jobs.length + 1).padStart(4, '0')}`,
      title: estimate.title, status: 'Scheduled', priority: 'Normal',
      contract_amount: estimate.total, material_cost: 0, labor_cost: 0,
      other_cost: 0, scope: estimate.scope,
    })
    if (error) return alert(error.message)
    await supabase.from('estimates').update({ status: 'Accepted' }).eq('id', estimate.id)
    await loadAll()
    setPage('jobs')
  }

  function jobCard(x) {
    const profit = Number(x.contract_amount) - Number(x.material_cost) - Number(x.labor_cost) - Number(x.other_cost)
    return <article className="card" key={x.id}>
      <div className="between"><div><h3>{x.number} · {x.title}</h3><div className="small">{customer(x.customer_id)?.name} · {property(x.property_id)?.address}</div></div><Badge>{x.status}</Badge></div>
      <p>Start {dateText(x.start_date)} · Due {dateText(x.due_date)} · Crew: {x.crew || 'Unassigned'}</p>
      <div className="small">Contract {money(x.contract_amount)} · Estimated profit <span className={profit >= 0 ? 'positive' : 'negative'}>{money(profit)}</span></div>
      <div className="actions"><button className="secondary" onClick={() => setEditor({ type: 'job', row: x })}>Open Job</button><button className="secondary" onClick={() => setEditor({ type: 'photos', row: x })}>Photos</button><button className="danger" onClick={() => remove('jobs', x.id)}>Delete</button></div>
    </article>
  }

  function dashboard() {
    return <>
      <div className="metrics"><Metric label="Customers" value={records.customers.length} /><Metric label="Open Estimates" value={openEstimates.length} /><Metric label="Active Jobs" value={activeJobs.length} /><Metric label="Receivables" value={money(receivables)} /><Metric label="Inventory Items" value={records.inventory.length} /><Metric label="Estimated Job Profit" value={money(estimatedProfit)} /><Metric label="Maintenance Due" value={records.maintenance.filter((x) => x.status !== 'Completed').length} /><Metric label="Cloud Status" value="Connected" /></div>
      <div className="grid-2"><section className="panel"><div className="between"><h2>Active Jobs</h2><button className="ghost" onClick={() => setPage('jobs')}>View all</button></div><div className="cards">{activeJobs.slice(0, 6).map(jobCard)}{!activeJobs.length && <Empty>No active jobs</Empty>}</div></section><section className="panel"><h2>Estimate Pipeline</h2><div className="cards">{openEstimates.slice(0, 6).map((x) => <article className="card" key={x.id}><div className="between"><div><h3>{x.number} · {x.title}</h3><div className="small">{customer(x.customer_id)?.name}</div></div><div><div className="money">{money(x.total)}</div><Badge>{x.status}</Badge></div></div></article>)}{!openEstimates.length && <Empty>No open estimates</Empty>}</div></section></div>
    </>
  }

  function customerProfile(c) {
    const properties = records.properties.filter((x) => x.customer_id === c.id)
    const estimates = records.estimates.filter((x) => x.customer_id === c.id)
    const jobs = records.jobs.filter((x) => x.customer_id === c.id)
    const invoices = records.invoices.filter((x) => x.customer_id === c.id)
    const maintenance = records.maintenance.filter((x) => x.customer_id === c.id)
    const invoiced = invoices.reduce((s, x) => s + Number(x.total || 0), 0)
    const paid = invoices.reduce((s, x) => s + Number(x.paid || 0), 0)

    return <>
      <div className="toolbar"><button className="secondary" onClick={() => setSelectedCustomerId(null)}>← Back to Customers</button><button className="primary" onClick={() => setEditor({ type: 'customer', row: c })}>Edit Customer</button></div>
      <section className="panel"><div className="between"><div><h2>{c.name}</h2><div className="small">{c.phone || 'No phone'} · {c.email || 'No email'}</div></div><Badge>{c.preferred_contact || 'Customer'}</Badge></div><div className="grid-2"><div><h3>Contact Details</h3><p><b>Phone:</b> {c.phone || '—'}</p><p><b>Email:</b> {c.email || '—'}</p><p><b>Preferred Contact:</b> {c.preferred_contact || '—'}</p><p><b>Billing Address:</b> {c.billing_address || '—'}</p></div><div><h3>Notes</h3><p>{c.notes || 'No notes saved.'}</p></div></div></section>
      <div className="metrics"><Metric label="Properties" value={properties.length} /><Metric label="Estimates" value={estimates.length} /><Metric label="Jobs" value={jobs.length} /><Metric label="Invoices" value={invoices.length} /><Metric label="Invoiced" value={money(invoiced)} /><Metric label="Balance Due" value={money(invoiced - paid)} /></div>
      <div className="grid-2">
        <section className="panel"><div className="between"><h2>Properties</h2><button className="primary" onClick={() => setEditor({ type: 'property', row: { customer_id: c.id } })}>+ Property</button></div><div className="cards">{properties.map((x) => <article className="card" key={x.id}><h3>{x.address}</h3><p>{x.lift_details || 'No lift details saved.'}</p><button className="secondary" onClick={() => setEditor({ type: 'property', row: x })}>Edit</button></article>)}{!properties.length && <Empty>No properties</Empty>}</div></section>
        <section className="panel"><div className="between"><h2>Estimates</h2><button className="primary" onClick={() => setEditor({ type: 'estimate', row: { customer_id: c.id } })}>+ Estimate</button></div><div className="cards">{estimates.map((x) => <article className="card" key={x.id}><div className="between"><div><h3>{x.number} · {x.title}</h3><div className="small">{property(x.property_id)?.address}</div></div><div><div className="money">{money(x.total)}</div><Badge>{x.status}</Badge></div></div></article>)}{!estimates.length && <Empty>No estimates</Empty>}</div></section>
        <section className="panel"><div className="between"><h2>Jobs</h2><button className="primary" onClick={() => setEditor({ type: 'job', row: { customer_id: c.id } })}>+ Job</button></div><div className="cards">{jobs.map(jobCard)}{!jobs.length && <Empty>No jobs</Empty>}</div></section>
        <section className="panel"><div className="between"><h2>Invoices</h2><button className="primary" onClick={() => setEditor({ type: 'invoice', row: { customer_id: c.id } })}>+ Invoice</button></div><div className="cards">{invoices.map((x) => <article className="card" key={x.id}><div className="between"><div><h3>{x.number}</h3><div className="small">Due {dateText(x.due_date)}</div></div><div><div className="money">{money(x.total)}</div><Badge>{x.status}</Badge></div></div><div className="small">Paid {money(x.paid)} · Balance {money(Number(x.total) - Number(x.paid))}</div></article>)}{!invoices.length && <Empty>No invoices</Empty>}</div></section>
      </div>
      <section className="panel"><h2>Maintenance and Service Reminders</h2><div className="cards">{maintenance.map((x) => <article className="card" key={x.id}><div className="between"><div><h3>{x.title}</h3><div className="small">{property(x.property_id)?.address}</div></div><div><div className="money">{dateText(x.due_date)}</div><Badge>{x.status}</Badge></div></div><p>{x.notes}</p></article>)}{!maintenance.length && <Empty>No reminders</Empty>}</div></section>
    </>
  }

  function customersPage() {
    const selected = customer(selectedCustomerId)
    if (selected) return customerProfile(selected)
    return <>
      <div className="toolbar"><input type="search" placeholder="Search customers…" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} style={{ width: 'min(420px, 100%)', padding: '12px 14px', borderRadius: 10, border: '1px solid #d6d9df', font: 'inherit' }} /><button className="primary" onClick={() => setEditor({ type: 'customer', row: {} })}>+ Customer</button></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Preferred Contact</th><th>Billing Address</th><th></th></tr></thead><tbody>{filteredCustomers.map((x) => <tr key={x.id}><td><button className="secondary" onClick={() => setSelectedCustomerId(x.id)}>{x.name}</button></td><td>{x.phone || '—'}</td><td>{x.email || '—'}</td><td>{x.preferred_contact || '—'}</td><td>{x.billing_address || '—'}</td><td><div className="actions"><button className="secondary" onClick={() => setEditor({ type: 'customer', row: x })}>Edit</button><button className="danger" onClick={() => remove('customers', x.id)}>Delete</button></div></td></tr>)}</tbody></table>{!filteredCustomers.length && <Empty>{records.customers.length ? 'No customers match your search' : 'No customers'}</Empty>}</div>
    </>
  }

  function propertiesPage() { return <><Toolbar add="Property" onAdd={() => setEditor({ type: 'property', row: {} })} /><div className="cards">{records.properties.map((x) => <article className="card" key={x.id}><div className="between"><div><h3>{x.address}</h3><div className="small">{customer(x.customer_id)?.name}</div></div><div className="actions"><button className="secondary" onClick={() => setEditor({ type: 'property', row: x })}>Edit</button><button className="danger" onClick={() => remove('properties', x.id)}>Delete</button></div></div><p>{x.lift_details}</p><div className="small">{x.dock_details} · {x.electrical} · {x.water_depth}</div></article>)}{!records.properties.length && <Empty>No properties</Empty>}</div></> }
  function estimatesPage() { return <><Toolbar add="Estimate" onAdd={() => setEditor({ type: 'estimate', row: {} })} /><div className="cards">{records.estimates.map((x) => <article className="card" key={x.id}><div className="between"><div><h3>{x.number} · {x.title}</h3><div className="small">{customer(x.customer_id)?.name} · {property(x.property_id)?.address}</div></div><div><div className="money">{money(x.total)}</div><Badge>{x.status}</Badge></div></div><p>{x.scope}</p><div className="actions"><button className="secondary" onClick={() => setEditor({ type: 'estimate', row: x })}>Edit</button><button className="primary" onClick={() => convertEstimate(x)}>Create Job</button><button className="danger" onClick={() => remove('estimates', x.id)}>Delete</button></div></article>)}{!records.estimates.length && <Empty>No estimates</Empty>}</div></> }
  function jobsPage() { return <><Toolbar add="Job" onAdd={() => setEditor({ type: 'job', row: {} })} /><div className="cards">{records.jobs.map(jobCard)}{!records.jobs.length && <Empty>No jobs</Empty>}</div></> }
  function invoicesPage() { return <><Toolbar add="Invoice" onAdd={() => setEditor({ type: 'invoice', row: {} })} /><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>{records.invoices.map((x) => <tr key={x.id}><td><b>{x.number}</b></td><td>{customer(x.customer_id)?.name}</td><td>{money(x.total)}</td><td>{money(x.paid)}</td><td>{money(Number(x.total) - Number(x.paid))}</td><td><Badge>{x.status}</Badge></td><td><button className="secondary" onClick={() => setEditor({ type: 'invoice', row: x })}>Edit</button></td></tr>)}</tbody></table></div></> }
  function inventoryPage() { return <><Toolbar add="Inventory Item" onAdd={() => setEditor({ type: 'inventory', row: {} })} /><div className="table-wrap"><table><thead><tr><th>Part</th><th>Description</th><th>Category</th><th>Cost</th><th>Sell</th><th>Stock</th><th>Location</th><th></th></tr></thead><tbody>{records.inventory.map((x) => <tr key={x.id}><td>{x.part_number}</td><td><b>{x.description}</b></td><td>{x.category}</td><td>{money(x.unit_cost)}</td><td>{money(x.sell_price)}</td><td>{Number(x.quantity) <= Number(x.reorder_level) ? <Badge>{x.quantity} Reorder</Badge> : x.quantity}</td><td>{x.location}</td><td><button className="secondary" onClick={() => setEditor({ type: 'inventory', row: x })}>Edit</button></td></tr>)}</tbody></table></div></> }
  function employeesPage() { return <><Toolbar add="Employee" onAdd={() => setEditor({ type: 'employee', row: {} })} /><div className="cards">{records.employees.map((x) => <article className="card" key={x.id}><div className="between"><div><h3>{x.name}</h3><div className="small">{x.role} · {x.phone}</div></div><Badge>{x.status}</Badge></div><div className="actions"><button className="secondary" onClick={() => setEditor({ type: 'employee', row: x })}>Edit</button></div></article>)}{!records.employees.length && <Empty>No employees</Empty>}</div></> }
  function maintenancePage() { return <><Toolbar add="Reminder" onAdd={() => setEditor({ type: 'maintenance', row: {} })} /><div className="cards">{records.maintenance.map((x) => <article className="card" key={x.id}><div className="between"><div><h3>{x.title}</h3><div className="small">{customer(x.customer_id)?.name} · {property(x.property_id)?.address}</div></div><div><div className="money">{dateText(x.due_date)}</div><Badge>{x.status}</Badge></div></div><p>{x.notes}</p></article>)}{!records.maintenance.length && <Empty>No reminders</Empty>}</div></> }
  function reportsPage() { const contracts = records.jobs.reduce((s, x) => s + Number(x.contract_amount), 0); const costs = records.jobs.reduce((s, x) => s + Number(x.material_cost) + Number(x.labor_cost) + Number(x.other_cost), 0); const invoiced = records.invoices.reduce((s, x) => s + Number(x.total), 0); const paid = records.invoices.reduce((s, x) => s + Number(x.paid), 0); return <div className="metrics"><Metric label="Contracts" value={money(contracts)} /><Metric label="Estimated Costs" value={money(costs)} /><Metric label="Estimated Gross Profit" value={money(contracts - costs)} /><Metric label="Invoiced" value={money(invoiced)} /><Metric label="Collected" value={money(paid)} /><Metric label="Receivables" value={money(invoiced - paid)} /></div> }

  const views = { dashboard, customers: customersPage, properties: propertiesPage, estimates: estimatesPage, jobs: jobsPage, invoices: invoicesPage, inventory: inventoryPage, employees: employeesPage, maintenance: maintenancePage, reports: reportsPage }
  function changePage(next) { setPage(next); if (next !== 'customers') setSelectedCustomerId(null) }

  return <div className="shell"><aside className="sidebar"><div className="brand"><div className="logo">GBL</div><div><strong>Galveston Boat Lifts</strong><span>Cloud Business OS</span></div></div><nav>{modules.map(([key, label]) => <button key={key} className={page === key ? 'active' : ''} onClick={() => changePage(key)}>{label}</button>)}</nav><div className="sidebar-foot">{session.user.email}<button onClick={() => supabase.auth.signOut()}>Sign out</button></div></aside><main className="main"><header className="header"><div><h1>{page === 'customers' && selectedCustomerId ? customer(selectedCustomerId)?.name || 'Customer' : modules.find(([key]) => key === page)?.[1]}</h1><p>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p></div></header><section className="content">{views[page]()}</section></main>{editor && <EditorModal editor={editor} close={() => setEditor(null)} save={save} records={records} session={session} />}</div>
}

function Splash({ text }) { return <div className="center"><div className="auth-card"><h1>{text}</h1></div></div> }
function ConfigurationScreen() { return <div className="center"><div className="auth-card"><h1>Configuration required</h1><p>Add these Netlify environment variables, then redeploy:</p><pre>VITE_SUPABASE_URL{'\n'}VITE_SUPABASE_PUBLISHABLE_KEY</pre></div></div> }
function AuthScreen() { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [message, setMessage] = useState(''); async function signIn(e) { e.preventDefault(); const { error } = await supabase.auth.signInWithPassword({ email, password }); setMessage(error?.message || 'Signing in…') } async function signUp() { const { error } = await supabase.auth.signUp({ email, password }); setMessage(error?.message || 'Account created. Check your email if confirmation is enabled.') } return <div className="center"><form className="auth-card" onSubmit={signIn}><h1>Galveston Boat Lifts</h1><p>Secure cloud business login</p><Field label="Email" value={email} onChange={setEmail} type="email" required /><Field label="Password" value={password} onChange={setPassword} type="password" required /><button className="primary full">Sign In</button><button type="button" className="secondary full" onClick={signUp}>Create First Account</button><div className="small">{message}</div></form></div> }
function Toolbar({ add, onAdd }) { return <div className="toolbar"><div /><button className="primary" onClick={onAdd}>+ {add}</button></div> }
function EditorModal({ editor, close, save, records, session }) { if (editor.type === 'photos') return <PhotosModal job={editor.row} close={close} session={session} />; return <RecordEditor type={editor.type} initial={editor.row} close={close} save={save} records={records} /> }

function RecordEditor({ type, initial, close, save, records }) {
  const [x, setX] = useState({ ...initial })
  const [lines, setLines] = useState(initial.line_items?.length ? initial.line_items : [{ description: '', qty: 1, price: 0 }])
  const set = (key, value) => setX((old) => ({ ...old, [key]: value }))
  const total = lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.price || 0), 0)
  const customerOptions = records.customers.map((c) => [c.id, c.name])
  const propertyOptions = records.properties.filter((p) => !x.customer_id || p.customer_id === x.customer_id).map((p) => [p.id, p.address])

  async function submit(e) {
    e.preventDefault()
    const recordId = initial.id || id()
    let table, row
    if (type === 'customer') { table = 'customers'; row = { id: recordId, name: x.name, phone: x.phone, email: x.email, preferred_contact: x.preferred_contact, billing_address: x.billing_address, notes: x.notes } }
    if (type === 'property') { table = 'properties'; row = { id: recordId, customer_id: x.customer_id, address: x.address, gate_code: x.gate_code, lift_details: x.lift_details, dock_details: x.dock_details, electrical: x.electrical, water_depth: x.water_depth, notes: x.notes } }
    if (type === 'estimate') { table = 'estimates'; row = { id: recordId, customer_id: x.customer_id, property_id: x.property_id || null, number: x.number || `EST-${Date.now()}`, title: x.title, status: x.status || 'Draft', scope: x.scope, valid_until: x.valid_until || null, line_items: lines, subtotal: total, tax: 0, total } }
    if (type === 'job') { table = 'jobs'; row = { id: recordId, customer_id: x.customer_id, property_id: x.property_id || null, estimate_id: x.estimate_id || null, number: x.number || `JOB-${Date.now()}`, title: x.title, status: x.status || 'Scheduled', priority: x.priority || 'Normal', crew: x.crew, start_date: x.start_date || null, due_date: x.due_date || null, warranty_end: x.warranty_end || null, contract_amount: Number(x.contract_amount || 0), material_cost: Number(x.material_cost || 0), labor_cost: Number(x.labor_cost || 0), other_cost: Number(x.other_cost || 0), scope: x.scope, notes: x.notes } }
    if (type === 'invoice') { table = 'invoices'; row = { id: recordId, customer_id: x.customer_id, job_id: x.job_id || null, number: x.number || `INV-${Date.now()}`, status: x.status || 'Draft', invoice_date: x.invoice_date || today(), due_date: x.due_date || null, paid: Number(x.paid || 0), notes: x.notes, line_items: lines, subtotal: total, tax: 0, total } }
    if (type === 'inventory') { table = 'inventory'; row = { id: recordId, part_number: x.part_number, description: x.description, category: x.category, vendor: x.vendor, unit_cost: Number(x.unit_cost || 0), sell_price: Number(x.sell_price || 0), quantity: Number(x.quantity || 0), reorder_level: Number(x.reorder_level || 0), location: x.location, notes: x.notes } }
    if (type === 'employee') { table = 'employees'; row = { id: recordId, name: x.name, role: x.role, phone: x.phone, email: x.email, status: x.status || 'Active', hourly_cost: Number(x.hourly_cost || 0), notes: x.notes } }
    if (type === 'maintenance') { table = 'maintenance'; row = { id: recordId, customer_id: x.customer_id, property_id: x.property_id || null, title: x.title, due_date: x.due_date || null, frequency: x.frequency, status: x.status || 'Due', notes: x.notes } }
    await save(table, row)
  }

  return <Modal title={`${initial.id ? 'Edit' : 'New'} ${type}`} onClose={close}><form onSubmit={submit}><div className="form-grid">
    {type === 'customer' && <><Field label="Name" value={x.name} onChange={(v) => set('name', v)} required /><Field label="Phone" value={x.phone} onChange={(v) => set('phone', v)} /><Field label="Email" value={x.email} onChange={(v) => set('email', v)} type="email" /><Field label="Preferred Contact" value={x.preferred_contact} onChange={(v) => set('preferred_contact', v)} /><Field label="Billing Address" value={x.billing_address} onChange={(v) => set('billing_address', v)} wide /><Field label="Notes" value={x.notes} onChange={(v) => set('notes', v)} type="textarea" wide /></>}
    {type === 'property' && <><SelectField label="Customer" value={x.customer_id} onChange={(v) => set('customer_id', v)} options={customerOptions} required /><Field label="Address" value={x.address} onChange={(v) => set('address', v)} required /><Field label="Gate Code" value={x.gate_code} onChange={(v) => set('gate_code', v)} /><Field label="Water Depth" value={x.water_depth} onChange={(v) => set('water_depth', v)} /><Field label="Electrical" value={x.electrical} onChange={(v) => set('electrical', v)} /><Field label="Lift Details" value={x.lift_details} onChange={(v) => set('lift_details', v)} type="textarea" wide /><Field label="Dock Details" value={x.dock_details} onChange={(v) => set('dock_details', v)} type="textarea" wide /><Field label="Notes" value={x.notes} onChange={(v) => set('notes', v)} type="textarea" wide /></>}
    {type === 'estimate' && <><Field label="Estimate Number" value={x.number} onChange={(v) => set('number', v)} /><SelectField label="Customer" value={x.customer_id} onChange={(v) => set('customer_id', v)} options={customerOptions} required /><SelectField label="Property" value={x.property_id} onChange={(v) => set('property_id', v)} options={propertyOptions} /><Field label="Title" value={x.title} onChange={(v) => set('title', v)} required /><Field label="Status" value={x.status || 'Draft'} onChange={(v) => set('status', v)} /><Field label="Valid Until" value={x.valid_until} onChange={(v) => set('valid_until', v)} type="date" /><Field label="Scope" value={x.scope} onChange={(v) => set('scope', v)} type="textarea" wide /></>}
    {type === 'job' && <><Field label="Job Number" value={x.number} onChange={(v) => set('number', v)} /><SelectField label="Customer" value={x.customer_id} onChange={(v) => set('customer_id', v)} options={customerOptions} required /><SelectField label="Property" value={x.property_id} onChange={(v) => set('property_id', v)} options={propertyOptions} /><Field label="Title" value={x.title} onChange={(v) => set('title', v)} required /><Field label="Status" value={x.status || 'Scheduled'} onChange={(v) => set('status', v)} /><Field label="Crew" value={x.crew} onChange={(v) => set('crew', v)} /><Field label="Start" value={x.start_date} onChange={(v) => set('start_date', v)} type="date" /><Field label="Due" value={x.due_date} onChange={(v) => set('due_date', v)} type="date" /><Field label="Warranty End" value={x.warranty_end} onChange={(v) => set('warranty_end', v)} type="date" /><Field label="Contract" value={x.contract_amount} onChange={(v) => set('contract_amount', v)} type="number" /><Field label="Material Cost" value={x.material_cost} onChange={(v) => set('material_cost', v)} type="number" /><Field label="Labor Cost" value={x.labor_cost} onChange={(v) => set('labor_cost', v)} type="number" /><Field label="Other Cost" value={x.other_cost} onChange={(v) => set('other_cost', v)} type="number" /><Field label="Scope" value={x.scope} onChange={(v) => set('scope', v)} type="textarea" wide /><Field label="Notes" value={x.notes} onChange={(v) => set('notes', v)} type="textarea" wide /></>}
    {type === 'invoice' && <><Field label="Invoice Number" value={x.number} onChange={(v) => set('number', v)} /><SelectField label="Customer" value={x.customer_id} onChange={(v) => set('customer_id', v)} options={customerOptions} required /><Field label="Status" value={x.status || 'Draft'} onChange={(v) => set('status', v)} /><Field label="Invoice Date" value={x.invoice_date} onChange={(v) => set('invoice_date', v)} type="date" /><Field label="Due Date" value={x.due_date} onChange={(v) => set('due_date', v)} type="date" /><Field label="Paid" value={x.paid} onChange={(v) => set('paid', v)} type="number" /><Field label="Notes" value={x.notes} onChange={(v) => set('notes', v)} type="textarea" wide /></>}
    {type === 'inventory' && <><Field label="Part Number" value={x.part_number} onChange={(v) => set('part_number', v)} /><Field label="Description" value={x.description} onChange={(v) => set('description', v)} required /><Field label="Category" value={x.category} onChange={(v) => set('category', v)} /><Field label="Vendor" value={x.vendor} onChange={(v) => set('vendor', v)} /><Field label="Unit Cost" value={x.unit_cost} onChange={(v) => set('unit_cost', v)} type="number" /><Field label="Sell Price" value={x.sell_price} onChange={(v) => set('sell_price', v)} type="number" /><Field label="Quantity" value={x.quantity} onChange={(v) => set('quantity', v)} type="number" /><Field label="Reorder Level" value={x.reorder_level} onChange={(v) => set('reorder_level', v)} type="number" /><Field label="Location" value={x.location} onChange={(v) => set('location', v)} /><Field label="Notes" value={x.notes} onChange={(v) => set('notes', v)} type="textarea" wide /></>}
    {type === 'employee' && <><Field label="Name" value={x.name} onChange={(v) => set('name', v)} required /><Field label="Role" value={x.role} onChange={(v) => set('role', v)} /><Field label="Phone" value={x.phone} onChange={(v) => set('phone', v)} /><Field label="Email" value={x.email} onChange={(v) => set('email', v)} type="email" /><Field label="Status" value={x.status || 'Active'} onChange={(v) => set('status', v)} /><Field label="Hourly Cost" value={x.hourly_cost} onChange={(v) => set('hourly_cost', v)} type="number" /><Field label="Notes" value={x.notes} onChange={(v) => set('notes', v)} type="textarea" wide /></>}
    {type === 'maintenance' && <><SelectField label="Customer" value={x.customer_id} onChange={(v) => set('customer_id', v)} options={customerOptions} required /><SelectField label="Property" value={x.property_id} onChange={(v) => set('property_id', v)} options={propertyOptions} /><Field label="Title" value={x.title} onChange={(v) => set('title', v)} required /><Field label="Due Date" value={x.due_date} onChange={(v) => set('due_date', v)} type="date" /><Field label="Frequency" value={x.frequency} onChange={(v) => set('frequency', v)} /><Field label="Status" value={x.status || 'Due'} onChange={(v) => set('status', v)} /><Field label="Notes" value={x.notes} onChange={(v) => set('notes', v)} type="textarea" wide /></>}
  </div>{['estimate', 'invoice'].includes(type) && <section className="panel line-panel"><div className="between"><h2>Line Items</h2><button type="button" className="secondary" onClick={() => setLines((old) => [...old, { description: '', qty: 1, price: 0 }])}>+ Line</button></div><div className="cards">{lines.map((line, index) => <div className="form-grid line-row" key={index}><Field label="Description" value={line.description} onChange={(v) => setLines((old) => old.map((item, i) => i === index ? { ...item, description: v } : item))} /><Field label="Qty" value={line.qty} onChange={(v) => setLines((old) => old.map((item, i) => i === index ? { ...item, qty: Number(v) } : item))} type="number" /><Field label="Unit Price" value={line.price} onChange={(v) => setLines((old) => old.map((item, i) => i === index ? { ...item, price: Number(v) } : item))} type="number" /></div>)}</div><h3>Total: {money(total)}</h3></section>}<div className="actions"><button className="primary">Save</button></div></form></Modal>
}

function PhotosModal({ job, close, session }) {
  const [photos, setPhotos] = useState([]), [file, setFile] = useState(null), [caption, setCaption] = useState('')
  useEffect(() => { load() }, [])
  async function load() { const { data, error } = await supabase.from('job_photos').select('*').eq('job_id', job.id).order('created_at', { ascending: false }); if (error) return alert(error.message); const signed = []; for (const photo of data || []) { const { data: url } = await supabase.storage.from('job-photos').createSignedUrl(photo.storage_path, 3600); signed.push({ ...photo, url: url?.signedUrl }) } setPhotos(signed) }
  async function upload() { if (!file) return alert('Choose a photo.'); const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); const path = `${session.user.id}/${job.id}/${Date.now()}-${safe}`; const { error } = await supabase.storage.from('job-photos').upload(path, file); if (error) return alert(error.message); await supabase.from('job_photos').insert({ user_id: session.user.id, job_id: job.id, storage_path: path, caption }); setFile(null); setCaption(''); await load() }
  return <Modal title={`Photos — ${job.title}`} onClose={close}><Field label="Caption" value={caption} onChange={setCaption} /><label>Choose photo<input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} /></label><button className="primary full" onClick={upload}>Upload Photo</button><div className="photo-grid">{photos.map((p) => <div className="photo" key={p.id}><img src={p.url} alt={p.caption || 'Job'} /><div>{p.caption}</div></div>)}</div></Modal>
