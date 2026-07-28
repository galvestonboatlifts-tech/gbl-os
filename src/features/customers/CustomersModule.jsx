import React, { useCallback, useEffect, useState } from 'react'
import { supabase as defaultSupabase } from '../../lib/supabase'
import CustomerDashboard from './CustomerDashboard'
import CustomerDetail from './CustomerDetail'
import CustomerEditor from './CustomerEditor'
import PropertyEditor from './PropertyEditor'
import { createEmptyCustomer, createEmptyProperty, prepareCustomerPayload } from './customerUtils'

async function safeSelect(supabase, table, orderColumn = 'created_at') {
  const result = await supabase.from(table).select('*').order(orderColumn, { ascending: false })

  if (!result.error) return { data: result.data || [], error: null }

  const message = String(result.error.message || '').toLowerCase()
  if (message.includes('does not exist') || message.includes('schema cache')) {
    return { data: [], error: null }
  }

  return { data: [], error: result.error }
}

export default function CustomersModule({ supabase = defaultSupabase }) {
  const [customers, setCustomers] = useState([])
  const [properties, setProperties] = useState([])
  const [boatLifts, setBoatLifts] = useState([])
  const [jobs, setJobs] = useState([])
  const [invoices, setInvoices] = useState([])

  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [customerEditor, setCustomerEditor] = useState(null)
  const [propertyEditor, setPropertyEditor] = useState(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    const results = await Promise.all([
      safeSelect(supabase, 'customers'),
      safeSelect(supabase, 'properties'),
      safeSelect(supabase, 'boat_lifts'),
      safeSelect(supabase, 'jobs'),
      safeSelect(supabase, 'invoices'),
    ])

    const firstError = results.map((x) => x.error).find(Boolean)
    if (firstError) setError(firstError.message)

    setCustomers(results[0].data)
    setProperties(results[1].data)
    setBoatLifts(results[2].data)
    setJobs(results[3].data)
    setInvoices(results[4].data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  const selectedCustomer =
    customers.find((customer) => customer.id === selectedCustomerId) || null

  async function saveCustomer(customer) {
    setSaving(true)
    setError('')

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) {
      setSaving(false)
      setError(authError.message)
      return
    }

    const payload = { ...prepareCustomerPayload(customer), user_id: authData.user?.id }

    const query = customer.id
      ? supabase.from('customers').update(payload).eq('id', customer.id)
      : supabase.from('customers').insert(payload)

    const { data, error: saveError } = await query.select().single()
    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      alert(saveError.message)
      return
    }

    setCustomerEditor(null)
    await loadData()
    setSelectedCustomerId(data.id)
  }

  async function saveProperty(property) {
    setSaving(true)
    setError('')

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError) {
      setSaving(false)
      setError(authError.message)
      return
    }

    const payload = {
      ...property,
      customer_id: property.customer_id || selectedCustomerId,
      user_id: authData.user?.id,
      address: String(property.address || '').trim(),
      updated_at: new Date().toISOString(),
    }

    delete payload.created_at

    const query = property.id
      ? supabase.from('properties').update(payload).eq('id', property.id)
      : supabase.from('properties').insert(payload)

    const { error: saveError } = await query
    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      alert(saveError.message)
      return
    }

    setPropertyEditor(null)
    await loadData()
  }

  async function deleteProperty(property) {
    if (!window.confirm('Delete this property?')) return

    const linked =
      boatLifts.some((x) => x.property_id === property.id) ||
      jobs.some((x) => x.property_id === property.id)

    if (linked) {
      alert('This property is linked to a boat lift or job and cannot be deleted.')
      return
    }

    const { error: deleteError } = await supabase.from('properties').delete().eq('id', property.id)

    if (deleteError) {
      alert(deleteError.message)
      return
    }

    await loadData()
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Customers</h2>
        <p>Loading customers...</p>
      </section>
    )
  }

  return (
    <>
      {error && (
        <section className="panel">
          <strong>Customers error</strong>
          <p>{error}</p>
          <button className="secondary" onClick={loadData}>Try Again</button>
        </section>
      )}

      {selectedCustomer ? (
        <CustomerDetail
          customer={selectedCustomer}
          properties={properties}
          boatLifts={boatLifts}
          jobs={jobs}
          invoices={invoices}
          onBack={() => setSelectedCustomerId(null)}
          onEditCustomer={setCustomerEditor}
          onAddProperty={() => setPropertyEditor(createEmptyProperty(selectedCustomer.id))}
          onEditProperty={setPropertyEditor}
          onDeleteProperty={deleteProperty}
        />
      ) : (
        <CustomerDashboard
          customers={customers}
          properties={properties}
          boatLifts={boatLifts}
          jobs={jobs}
          invoices={invoices}
          onOpenCustomer={setSelectedCustomerId}
          onAddCustomer={() => setCustomerEditor(createEmptyCustomer())}
          onEditCustomer={setCustomerEditor}
        />
      )}

      {customerEditor && (
        <CustomerEditor
          customer={customerEditor}
          saving={saving}
          onClose={() => setCustomerEditor(null)}
          onSave={saveCustomer}
        />
      )}

      {propertyEditor && (
        <PropertyEditor
          customerId={selectedCustomerId}
          property={propertyEditor}
          saving={saving}
          onClose={() => setPropertyEditor(null)}
          onSave={saveProperty}
        />
      )}
    </>
  )
}
