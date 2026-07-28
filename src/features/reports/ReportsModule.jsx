
import React from 'react'

export default function ReportsModule() {
  return (
    <div className="reports-module">
      <div className="toolbar">
        <div>
          <h1 style={{margin:0}}>Business Reports</h1>
          <p className="small">
            Central reporting dashboard for GBL OS.
          </p>
        </div>
      </div>

      <div className="metrics">
        <div className="metric"><span>Revenue Today</span><strong>$0.00</strong></div>
        <div className="metric"><span>Revenue This Month</span><strong>$0.00</strong></div>
        <div className="metric"><span>Open Jobs</span><strong>0</strong></div>
        <div className="metric"><span>Outstanding Invoices</span><strong>0</strong></div>
      </div>

      <section className="panel">
        <h2>Financial Reports</h2>
        <ul>
          <li>Revenue by day / week / month / year</li>
          <li>Invoice aging</li>
          <li>Outstanding balances</li>
          <li>Estimate conversion</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Job Reports</h2>
        <ul>
          <li>Open jobs</li>
          <li>Completed jobs</li>
          <li>Jobs by technician</li>
          <li>Average completion time</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Customer Reports</h2>
        <ul>
          <li>Top customers</li>
          <li>New customers</li>
          <li>Repeat customers</li>
          <li>Inactive customers</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Boat Lift Reports</h2>
        <ul>
          <li>Installed lifts</li>
          <li>Warranty expirations</li>
          <li>Maintenance due</li>
          <li>Service history</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Technician Reports</h2>
        <ul>
          <li>Hours worked</li>
          <li>Jobs completed</li>
          <li>Service reports submitted</li>
          <li>Productivity</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Export</h2>
        <div className="actions">
          <button className="primary">Export PDF</button>
          <button className="secondary">Export Excel</button>
          <button className="secondary">Export CSV</button>
          <button className="secondary">Print</button>
        </div>
      </section>
    </div>
  )
}
