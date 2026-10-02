'use client';
/* =========================================================================
   ClimateFrontDoor — /climate/ paid-traffic front door.
   Wraps the EXISTING Darwin map. Nothing in MapHero / USAMapSVG /
   AddressSearch / projection.js is modified or re-implemented here.

   Drop at: app/lender-climate/_components/ClimateFrontDoor.jsx
   Render from app/lender-climate/page.jsx INSTEAD of ClimateShell.

   Reused unchanged : MapHero, USAMapSVG, AddressSearch, BankPin,
                      StateTooltip, lib/projection.js, lib/colors.js,
                      lib/climateClient.js, _styles/map.css
   Not rendered here: NationalMetrics, StateTable, BankMetrics,
                      SlidePanel, CTASection  (dashboard-only)
   Added           : this file + _styles/front-door.css
   ========================================================================= */
import { useMemo, useState } from 'react';
import MapHero from './MapHero';
import '../_styles/map.css';
import '../_styles/front-door.css';

const VISIBLE_COUNT = 5;

const PRICING = {
  base_cents: 4999,
  business_addon_cents: 1500,
  max_businesses: 20,
};

const TABLE_LABEL = {
  OnlineBizCC: 'Business card · apply online',
  InBranchBizCC: 'Business card · apply in branch',
  PersonalCC: 'Personal card',
  PersonalLoans: 'Personal loan',
};

const money = (c) => `$${(c / 100).toFixed(2)}`;
const initials = (n) =>
  n.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2)
   .map((w) => w[0]).join('').toUpperCase();

/* ------------------------------------------------------------------ */

export default function ClimateFrontDoor({ climate, disclosure }) {
  const { states = [], banks = [], as_of, stale } = climate || {};

  const [located, setLocated] = useState(null); // { stateCode, stateName, lat, lng }
  const [step, setStep] = useState('locate');   // locate → unlock → pay → paid
  const [businesses, setBusinesses] = useState([]);
  const [agreed, setAgreed] = useState(false);

  // Same eligibility rule the staff matcher uses. Replace this filter with the
  // real call to src/lenders/match.mjs when wiring — the shape is identical.
  const matches = useMemo(() => {
    if (!located?.stateCode) return [];
    const sc = located.stateCode;
    return banks.filter((b) => {
      const e = b.eligible_states;
      if (!e) return false;
      if (e === 'All States') return true;
      return e.split(',').map((s) => s.trim()).includes(sc);
    });
  }, [banks, located]);

  const hasLocation = step !== 'locate';
  const visible = matches.slice(0, VISIBLE_COUNT);
  const locked = matches.slice(VISIBLE_COUNT);
  const total = PRICING.base_cents + PRICING.business_addon_cents * businesses.length;

  function handleLocated(result) {
    // AddressSearch already returns { ok, stateCode, lat, lng } from
    // /api/proxy/geocode. MapHero consumes the same object — we only listen in.
    if (!result?.stateCode) return;
    const row = states.find((s) => s.state === result.stateCode);
    setLocated({
      stateCode: result.stateCode,
      stateName: row?.name || result.stateCode,
      lat: result.lat,
      lng: result.lng,
    });
    setStep('matches');
  }

  return (
    <div className="fd" data-loc={hasLocation ? '1' : '0'}>
      {/* HEADS UP: the Darwin pack's MapHero/USAMapSVG render a FLAT SVG state
          map, not a globe — us-states-paths.json in the pack is five
          placeholder rectangles. The 3-D dot globe in the HTML mock is new
          work, not something in these files.

          Two ways to go, pick one before building:
          (a) keep MapHero as below and accept the flat state map, or
          (b) replace this slot with the mock's <canvas> globe, which needs a
              camera contract of { lat, lng, zoom, fx, fy } and an eased
              fly-to. Everything outside this div is unaffected either way.

          On desktop this layer is 118vh, not the full stage height — sized to
          the stage the projection stretches and the pins land on the cards. */}
      <div className="fd-map">
        <MapHero
          states={states}
          banks={banks}
          asOf={as_of}
          stale={stale}
          focusState={located?.stateCode || null}
          onResolved={handleLocated}   /* add this one pass-through to MapHero */
        />
      </div>

      <header className="fd-brand">
        <span className="fd-word">fundhub</span>
        <span className="fd-count">{banks.length.toLocaleString()} lenders</span>
      </header>

      <div className="fd-shell">
        <section className="fd-left">
          {step === 'locate' && <Intro count={banks.length} />}
          {step === 'matches' && <MatchIntro state={located.stateName} n={matches.length} />}
          {step === 'unlock' && <UnlockIntro state={located.stateName} />}
          {step === 'pay' && <PayIntro state={located.stateName} />}
          {step === 'paid' && <PaidIntro state={located.stateName} n={matches.length} />}
          <Legal />
        </section>

        <section className="fd-right">
          {step === 'matches' && (
            <MatchList
              state={located.stateName}
              visible={visible}
              locked={locked}
              total={matches.length}
              onUnlock={() => setStep('unlock')}
            />
          )}

          {step === 'unlock' && (
            <IdentityForm
              disclosure={disclosure}
              businesses={businesses}
              setBusinesses={setBusinesses}
              agreed={agreed}
              setAgreed={setAgreed}
              total={total}
              defaults={{ state: located.stateCode }}
              onContinue={() => setStep('pay')}
            />
          )}

          {step === 'pay' && (
            <Checkout
              total={total}
              extras={businesses.length}
              onPaid={() => setStep('paid')}
            />
          )}

          {step === 'paid' && <PortalHandoff total={total} />}
        </section>
      </div>
    </div>
  );
}

/* ---------------------------- left column ---------------------------- */

function Intro({ count }) {
  return (
    <>
      <h1>Where you live decides which banks will lend to your business.</h1>
      <p className="fd-lede">
        Enter your address. UnderwriteIQ matches your location against {count.toLocaleString()}{' '}
        active lenders and returns the ones that fund businesses in your state.
      </p>
      <p className="fd-hint">
        No hard inquiry — soft pull only for the assessment. Five lenders are free to view.
      </p>
    </>
  );
}

function MatchIntro({ state, n }) {
  return (
    <>
      <h1>{n} lenders fund businesses in {state}.</h1>
      <p className="fd-lede">
        These come from the Fundhub lender database, filtered to {state} eligibility and
        business card programs. Five are shown. The rest open in your portal after checkout.
      </p>
    </>
  );
}

function UnlockIntro({ state }) {
  return (
    <>
      <h1>Your details unlock the full {state} list.</h1>
      <p className="fd-lede">
        We run one soft inquiry to confirm who you are and finish the match. Your score is
        not affected.
      </p>
      <ul className="fd-trust">
        <li>256-bit encryption in transit and at rest.</li>
        <li>Your advisor never sees your Social Security number on their screen.</li>
        <li>Soft inquiry only. It is visible to you and no one else.</li>
      </ul>
    </>
  );
}

function PayIntro({ state }) {
  return (
    <>
      <h1>One payment opens your full list.</h1>
      <p className="fd-lede">
        Your authorization is saved. Pay below and the soft pull runs, then your {state} list
        is written to your portal.
      </p>
    </>
  );
}

function PaidIntro({ state, n }) {
  return (
    <>
      <h1>Your list is in your portal.</h1>
      <p className="fd-lede">
        All {n} {state} lenders, with products and application links, are on your Bank and
        Lender Match List.
      </p>
    </>
  );
}

function Legal() {
  return (
    <div className="fd-legal">
      <p>
        Fundhub is not a direct lender and does not approve credit. Matches are based on
        state eligibility and product criteria held in the Fundhub lender database. Approval,
        amounts, rates and terms are decided by each lender.
      </p>
      <p>No hard inquiry — soft pull only for the assessment.</p>
    </div>
  );
}

/* ---------------------------- right column ---------------------------- */

function LenderRow({ lender, locked }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="fd-lender">
      <div className="fd-logo">
        {broken || !lender.logo_path
          ? initials(lender.name)
          : <img src={lender.logo_path} alt="" onError={() => setBroken(true)} />}
      </div>
      <div className="fd-lmeta">
        <div className="fd-lname">{lender.name}</div>
        {lender.product_name && <div className="fd-lprod">{lender.product_name}</div>}
        <div className="fd-ltags">
          <span className="fd-tag">{TABLE_LABEL[lender.lender_table] || lender.lender_table}</span>
          {lender.bureaus_pulled && <span className="fd-tag">Pulls {lender.bureaus_pulled}</span>}
        </div>
      </div>
      {!locked && lender.application_url && (
        <div className="fd-lgo">
          <a href={lender.application_url} target="_blank" rel="noopener noreferrer">Apply</a>
        </div>
      )}
    </div>
  );
}

function MatchList({ state, visible, locked, total, onUnlock }) {
  return (
    <>
      <div className="fd-matchhead">
        <h2>Your {state} list</h2>
        <span className="fd-n">{visible.length} SHOWN · {locked.length} LOCKED</span>
      </div>

      <div className="fd-lenders">
        {visible.map((l) => <LenderRow key={l.id} lender={l} />)}
      </div>

      <div className="fd-gate">
        {/* real rows render, then get frosted — nothing fake behind the blur */}
        <div className="fd-lenders" aria-hidden="true">
          {locked.slice(0, 7).map((l) => <LenderRow key={l.id} lender={l} locked />)}
        </div>
        <div className="fd-scrim" />
        <div className="fd-unlock">
          <p>Enter your info to see the rest of your matches.</p>
          <p className="fd-sub">
            {locked.length} more lenders, with products and application links.
          </p>
          <button className="fd-btn" onClick={onUnlock}>
            Unlock all {total} — {money(PRICING.base_cents)}
          </button>
        </div>
      </div>
    </>
  );
}

function IdentityForm({
  disclosure, businesses, setBusinesses, agreed, setAgreed, total, defaults, onContinue,
}) {
  const addBiz = () =>
    businesses.length < PRICING.max_businesses && setBusinesses([...businesses, {}]);
  const rmBiz = (i) => setBusinesses(businesses.filter((_, k) => k !== i));
  const setBiz = (i, k, v) =>
    setBusinesses(businesses.map((b, j) => (j === i ? { ...b, [k]: v } : b)));

  return (
    <>
      <div className="fd-panel">
        <h3>Your information</h3>

        <label htmlFor="granted_name">Full legal name</label>
        <input id="granted_name" name="granted_name" autoComplete="name" />

        <label htmlFor="ssn">Social Security number</label>
        <input id="ssn" name="ssn" inputMode="numeric" autoComplete="off" placeholder="123-45-6789" />
        <p className="fd-hint">
          Encrypted in transit with 256-bit TLS and used only for this soft inquiry.
        </p>

        <label htmlFor="dob">Date of birth</label>
        <input id="dob" name="dob" type="date" />

        <label htmlFor="address_line1">Street address</label>
        <input id="address_line1" name="address_line1" autoComplete="street-address" />

        <div className="fd-row2">
          <div>
            <label htmlFor="city">City</label>
            <input id="city" name="city" />
          </div>
          <div>
            <label htmlFor="state">State</label>
            <input id="state" name="state" maxLength={2} defaultValue={defaults.state} />
          </div>
        </div>

        <label htmlFor="postal_code">ZIP</label>
        <input id="postal_code" name="postal_code" inputMode="numeric" />
      </div>

      <div className="fd-panel">
        <h3>Your businesses</h3>
        <p className="fd-hint">
          Add each business you want funded. Each one adds{' '}
          {money(PRICING.business_addon_cents)} and its own lender matches. Leave this empty
          if you only want your personal list.
        </p>

        {businesses.map((b, i) => (
          <div className="fd-biz" key={i}>
            <div className="fd-bizhead">
              <strong>Business {i + 1}</strong>
              <button type="button" className="fd-bizrm" onClick={() => rmBiz(i)}>Remove</button>
            </div>
            <label htmlFor={`biz_name_${i}`}>Business name</label>
            <input id={`biz_name_${i}`} value={b.name || ''} onChange={(e) => setBiz(i, 'name', e.target.value)} />
            <label htmlFor={`biz_line1_${i}`}>Business street address</label>
            <input id={`biz_line1_${i}`} value={b.address_line1 || ''} onChange={(e) => setBiz(i, 'address_line1', e.target.value)} />
            <div className="fd-row2">
              <div>
                <label htmlFor={`biz_city_${i}`}>City</label>
                <input id={`biz_city_${i}`} value={b.city || ''} onChange={(e) => setBiz(i, 'city', e.target.value)} />
              </div>
              <div>
                <label htmlFor={`biz_state_${i}`}>State</label>
                <input id={`biz_state_${i}`} maxLength={2} value={b.state || ''} onChange={(e) => setBiz(i, 'state', e.target.value)} />
              </div>
            </div>
            <label htmlFor={`biz_zip_${i}`}>ZIP</label>
            <input id={`biz_zip_${i}`} inputMode="numeric" value={b.postal_code || ''} onChange={(e) => setBiz(i, 'postal_code', e.target.value)} />
            <label htmlFor={`biz_ein_${i}`}>EIN</label>
            <input id={`biz_ein_${i}`} inputMode="numeric" placeholder="12-3456789" value={b.ein || ''} onChange={(e) => setBiz(i, 'ein', e.target.value)} />
            <label htmlFor={`biz_inc_${i}`}>When was this business incorporated?</label>
            <input id={`biz_inc_${i}`} type="month" value={b.incorporated_date || ''} onChange={(e) => setBiz(i, 'incorporated_date', e.target.value)} />
            <label htmlFor={`biz_owner_${i}`}>Extra owner name, if any</label>
            <input id={`biz_owner_${i}`} value={b.extra_owner_name || ''} onChange={(e) => setBiz(i, 'extra_owner_name', e.target.value)} />
          </div>
        ))}

        <button type="button" className="fd-btn fd-btn-ghost" onClick={addBiz}>Add a business</button>
      </div>

      <div className="fd-panel">
        <h3>Soft pull authorization</h3>
        {/* disclosure.text + disclosure.version come from GET /api/soft-pull-approve */}
        <div className="fd-disc">{disclosure?.text}</div>
        <p className="fd-hint">Version {disclosure?.version || '—'}</p>

        <label className="fd-agree">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I authorize Fundhub to obtain my credit report as a soft inquiry for this assessment.</span>
        </label>

        <div className="fd-total">
          <span className="fd-lbl">
            {businesses.length
              ? `${money(PRICING.base_cents)} list + ${businesses.length} × ${money(PRICING.business_addon_cents)}`
              : `${money(PRICING.base_cents)} list`}
          </span>
          <span className="fd-amt">{money(total)}</span>
        </div>

        <button className="fd-btn" disabled={!agreed} onClick={onContinue}>
          Agree and continue to checkout
        </button>
        <p className="fd-hint">Complete checkout and your full list opens in your portal.</p>
      </div>
    </>
  );
}

function Checkout({ total, extras, onPaid }) {
  return (
    <>
      <div className="fd-panel">
        <h3>Order</h3>
        <div className="fd-total">
          <span className="fd-lbl">Lender match list</span>
          <span className="fd-amt">{money(PRICING.base_cents)}</span>
        </div>
        {extras > 0 && (
          <div className="fd-total">
            <span className="fd-lbl">
              {extras} additional {extras === 1 ? 'business' : 'businesses'} ×{' '}
              {money(PRICING.business_addon_cents)}
            </span>
            <span className="fd-amt">{money(PRICING.business_addon_cents * extras)}</span>
          </div>
        )}
        <div className="fd-total fd-total-due">
          <span className="fd-lbl">Total due today</span>
          <span className="fd-amt">{money(total)}</span>
        </div>

        {/* Engineers: mint a variable-amount Commas session on the EXISTING
            "Consulting Services Assessment" product (offer key SOFT_PULL /
            productCode diagnostic), same pattern as the payment-link and
            optimize checkouts. Never POST /public-api/products/create. Then
            swap this button for the Commas iframe or redirect. */}
        <button className="fd-btn" onClick={onPaid}>Pay {money(total)}</button>
        <p className="fd-hint">
          Commas checkout embeds here — variable-amount session on the existing
          Consulting Services Assessment product. No new SKU is minted.
        </p>
      </div>

      <div className="fd-panel">
        <h3>What happens after you pay</h3>
        <ul className="fd-trust">
          <li>The soft pull runs. Nothing else is needed from you.</li>
          <li>Your Bank and Lender Match List is written to your portal.</li>
          <li>You apply directly with each lender on your own schedule.</li>
        </ul>
      </div>
    </>
  );
}

function PortalHandoff({ total }) {
  return (
    <>
      <div className="fd-ok">
        <h2>Payment received — {money(total)}</h2>
        <p>
          Your Bank and Lender Match List is ready. The soft pull runs automatically and the
          list updates in place as matches change.
        </p>
      </div>
      <div className="fd-panel">
        <h3>Bank and Lender Match List</h3>
        <p className="fd-hint">
          Entitlement code <code>bank-lender-match-list</code> · delivered in the customer
          portal, not by email.
        </p>
        <a className="fd-btn" href="/app/client-portal.html">Open your portal</a>
      </div>
    </>
  );
}
