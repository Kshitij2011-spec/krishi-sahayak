function MandiPricePage() {
  return (
    <>
      <section className="hero">
        <h1 className="hero-title">Mandi Price Lookup</h1>
        <p className="hero-subtitle">Check latest commodity prices from nearby mandis</p>
      </section>

      <div className="container">
        <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <h2 className="card-title">Search Commodity Prices</h2>
          <div className="form-grid" style={{ maxWidth: '500px' }}>
            <div className="form-group">
              <label htmlFor="commodity">Commodity</label>
              <select id="commodity" disabled>
                <option>Wheat</option>
                <option>Cotton</option>
                <option>Paddy (Rice)</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="mandi-district">District</label>
              <select id="mandi-district" disabled>
                <option>Ludhiana</option>
                <option>Amritsar</option>
                <option>Bathinda</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-xl)' }}>
            <button className="btn btn-primary" disabled id="btn-search-mandi">
              Search Prices (Coming Day 4)
            </button>
          </div>
        </div>

        <div className="alert alert-warning">
          <strong>Coming Soon:</strong> Live mandi price data via the data.gov.in Agmarknet API will be integrated on Day 4.
          You will be able to compare prices across nearby mandis for wheat, cotton, and paddy.
        </div>
      </div>
    </>
  );
}

export default MandiPricePage;
