import React, { useState, useRef, useEffect } from 'react'

function parseNumber(v, fallback = 0) {
  if (v === '' || v == null) return fallback
  const n = Number(String(v).replace(/[,\$]/g, ''))
  return Number.isFinite(n) ? n : fallback
}

// persistent state hook using localStorage
function usePersistentState(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? JSON.parse(raw) : initial
    } catch (e) {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch (e) {}
  }, [key, state])

  return [state, setState]
}

// universal money formatter: round up to nearest dollar, no cents
function fmt(n) {
  if (n == null) return '-'
  return Math.ceil(n).toLocaleString()
}

function calculate(currentAssets, yearsToRetire, yearsInRetirement, withdrawal, rPre, rPost, g, pensionAnnual = 0, ssAnnual = 0, ssOffset = 0, fixedIncomeInflation = 0) {
  const N = yearsInRetirement
  if (N <= 0) return { targetCorpus: 0, annual: 0 }

  let targetCorpus
  // target corpus at retirement to support inflation-adjusted withdrawals
  // account for pension (starts at retirement) and social security (starts after ssOffset years)
  let pv = 0
  for (let t = 0; t < N; t++) {
    // base withdrawal in year t (t=0 is first year of retirement)
    const baseWithdrawal = withdrawal * Math.pow(1 + g, t)
    // pension starts at retirement and grows by fixedIncomeInflation
    const pensionAdj = pensionAnnual * Math.pow(1 + fixedIncomeInflation, t)
    // social security starts at ssOffset (years after retirement) and grows by fixedIncomeInflation from its start
    let ssAdj = 0
    if (t >= ssOffset) {
      ssAdj = ssAnnual * Math.pow(1 + fixedIncomeInflation, t - ssOffset)
    }
    const netWithdrawal = Math.max(0, baseWithdrawal - pensionAdj - ssAdj)
    // discount to retirement: withdrawals occur at end of each retirement year,
    // so the first withdrawal is one year after retirement (exponent t+1).
    pv += netWithdrawal / Math.pow(1 + rPost, t + 1)
  }
  targetCorpus = pv

  const n = yearsToRetire
  const fvAssets = currentAssets * Math.pow(1 + rPre, n)
  const neededFv = Math.max(0, targetCorpus - fvAssets)

  if (n === 0) {
    const lumpNeeded = Math.max(0, targetCorpus - currentAssets)
    return { targetCorpus, annual: 0, lumpNeeded }
  }

  let annual
  if (rPre > 0) {
    const annuityFactor = (Math.pow(1 + rPre, n) - 1) / rPre
    annual = neededFv / annuityFactor
  } else {
    annual = neededFv / n
  }

  return { targetCorpus, annual }
}

export default function App() {
  const now = new Date()

  const [currentAge, setCurrentAge] = usePersistentState('fin.currentAge', '40')

  const [retirementAccounts, setRetirementAccounts] = usePersistentState('fin.retirementAccounts', '')
  const [nonRetirement, setNonRetirement] = usePersistentState('fin.nonRetirement', '')
  const [retirementAge, setRetirementAge] = usePersistentState('fin.retirementAge', '65')
  const [lastAge, setLastAge] = usePersistentState('fin.lastAge', '95')
  const [penaltyFreeAge, setPenaltyFreeAge] = usePersistentState('fin.penaltyFreeAge', '59.5')
  const [withdrawal, setWithdrawal] = usePersistentState('fin.withdrawal', '50000')
  const [monthlyFixedIncome, setMonthlyFixedIncome] = usePersistentState('fin.monthlyFixedIncome', '0')
  const [monthlyPension, setMonthlyPension] = usePersistentState('fin.monthlyPension', '0')
  const [ssStartAge, setSsStartAge] = usePersistentState('fin.ssStartAge', '67')
  const [monthlySocialSecurity, setMonthlySocialSecurity] = usePersistentState('fin.monthlySocialSecurity', '0')
  const [fixedIncomeInflation, setFixedIncomeInflation] = usePersistentState('fin.fixedIncomeInflation', '0')
  const [inflation, setInflation] = usePersistentState('fin.inflation', '2')
  const [rPre, setRPre] = usePersistentState('fin.rPre', '6')
  const [rPost, setRPost] = usePersistentState('fin.rPost', '4')

  // configurable contribution limits
  const [iraLimit, setIraLimit] = usePersistentState('fin.iraLimit', '7500')
  const [four01kLimit, setFour01kLimit] = usePersistentState('fin.four01kLimit', '24500')

  // New inputs for salary and employer match (user does NOT input their own 401(k)% or IRA)
  const [salary, setSalary] = usePersistentState('fin.salary', '80000')
  const [bonus, setBonus] = usePersistentState('fin.bonus', '0')
  const [employerMatchPct, setEmployerMatchPct] = usePersistentState('fin.employerMatchPct', '3')

  // numeric versions with hint fallbacks (use placeholder/hint values when inputs are empty)
  const curAgeNum = parseNumber(currentAge, 40)
  const retirementAgeNum = parseNumber(retirementAge, 65)
  const lastAgeNum = parseNumber(lastAge, 95)
  const penaltyFreeAgeNum = parseNumber(penaltyFreeAge, 59.5)
  const withdrawalVal = parseNumber(withdrawal, 50000)
  const monthlyFixedIncomeVal = parseNumber(monthlyFixedIncome, 0)
  const monthlyPensionVal = parseNumber(monthlyPension, 0)
  const ssStartAgeNum = parseNumber(ssStartAge, retirementAgeNum)
  const monthlySocialSecurityVal = parseNumber(monthlySocialSecurity, 0)
  const fixedIncomeInflationPct = parseNumber(fixedIncomeInflation, 0) / 100
  const fixedIncomeAnnual = monthlyFixedIncomeVal * 12
  const pensionAnnual = monthlyPensionVal * 12
  const ssAnnual = monthlySocialSecurityVal * 12
  const ssOffset = Math.max(0, ssStartAgeNum - retirementAgeNum)
  const inflationPct = parseNumber(inflation, 2) / 100
  const rPrePct = parseNumber(rPre, 6) / 100
  const rPostPct = parseNumber(rPost, 4) / 100
  const salaryVal = parseNumber(salary, 80000)
  const bonusVal = parseNumber(bonus, 0)
  const employerMatchPctNum = parseNumber(employerMatchPct, 3)

  const currentAssets = parseNumber(retirementAccounts, 0) + parseNumber(nonRetirement, 0)

  const yearsToRetire = Math.max(0, retirementAgeNum - curAgeNum)
  const yearsInRetirement = Math.max(0, lastAgeNum - retirementAgeNum + 1)

  const { targetCorpus, annual, lumpNeeded } = calculate(
    currentAssets,
    yearsToRetire,
    yearsInRetirement,
    withdrawalVal,
    rPrePct,
    rPostPct,
    inflationPct,
    pensionAnnual,
    ssAnnual,
    ssOffset,
    fixedIncomeInflationPct
  )

  // compute current annual retirement contributions: assume user is not currently contributing (employer match not counted unless user contributes)
  const employee401k = 0 // user doesn't input their employee contribution; we'll recommend one
  const employerMatch = salaryVal * (employerMatchPctNum / 100)
  const annualRetirementContrib = 0
  const annualNonRetContrib = 0 // assume user isn't contributing to non-ret unless recommended

  // project balances to retirement using current contributions
  function projectBalancesToRetirement() {
    let ret = parseNumber(retirementAccounts)
    let nonret = parseNumber(nonRetirement)
    const n = yearsToRetire
    const rate = rPrePct
    for (let i = 0; i < n; i++) {
      ret = ret * (1 + rate) + annualRetirementContrib
      nonret = nonret * (1 + rate) + annualNonRetContrib
    }
    return { ret, nonret }
  }

  const { ret: projRetAtRet, nonret: projNonretAtRet } = projectBalancesToRetirement()

  // projection including recommended additional non-ret annual saving
  function projectBalancesWithAdditionalNonRet(additionalNonRetAnnual) {
    let ret = parseNumber(retirementAccounts)
    let nonret = parseNumber(nonRetirement)
    const n = yearsToRetire
    const rate = rPrePct
    for (let i = 0; i < n; i++) {
      ret = ret * (1 + rate) + annualRetirementContrib
      nonret = nonret * (1 + rate) + (annualNonRetContrib + additionalNonRetAnnual)
    }
    return { ret, nonret }
  }

  // projection including recommended retirement contributions and non-ret additional savings
  function projectBalancesWithRecommendations(additionalNonRetAnnual, emp401kDollar, employerMatchDollar, iraDollar) {
    let ret = parseNumber(retirementAccounts)
    let nonret = parseNumber(nonRetirement)
    const n = yearsToRetire
    const rate = rPrePct
    const annualRetWithRec = (emp401kDollar || 0) + (employerMatchDollar || 0) + (iraDollar || 0)
    for (let i = 0; i < n; i++) {
      ret = ret * (1 + rate) + annualRetWithRec
      nonret = nonret * (1 + rate) + (annualNonRetContrib + additionalNonRetAnnual)
    }
    return { ret, nonret }
  }

  // (will compute projection with recommended non-ret after neededNonretAnnual is known)

  // compute early withdrawal need if retirement age < penalty-free age
  const earlyYears = Math.max(0, penaltyFreeAgeNum - retirementAgeNum)
  let earlyNeeded = 0
  const rPostVal = rPostPct
  const g = inflationPct
  if (earlyYears > 0) {
    if (Math.abs(rPostVal - g) > 1e-12) {
      const q = (1 + g) / (1 + rPostVal)
      // compute PV of net withdrawals in the early years accounting for pension and SS
      let pvEarly = 0
      for (let t = 0; t < earlyYears; t++) {
        const baseWithdrawal = withdrawalVal * Math.pow(1 + g, t)
        const pensionAdj = pensionAnnual * Math.pow(1 + fixedIncomeInflationPct, t)
        let ssAdj = 0
        if (t >= ssOffset) ssAdj = ssAnnual * Math.pow(1 + fixedIncomeInflationPct, t - ssOffset)
        const net = Math.max(0, baseWithdrawal - pensionAdj - ssAdj)
        // discount to retirement: early-year withdrawals are payments in the
        // retirement-year sequence; discount by (1+r)^(t+1) to align timing.
        pvEarly += net / Math.pow(1 + rPostVal, t + 1)
      }
      earlyNeeded = pvEarly
    } else {
      // fallback sum
      let pv = 0
      for (let t = 0; t < earlyYears; t++) {
        const baseWithdrawal = withdrawalVal * Math.pow(1 + g, t)
        const pensionAdj = pensionAnnual * Math.pow(1 + fixedIncomeInflationPct, t)
        let ssAdj = 0
        if (t >= ssOffset) ssAdj = ssAnnual * Math.pow(1 + fixedIncomeInflationPct, t - ssOffset)
        const net = Math.max(0, baseWithdrawal - pensionAdj - ssAdj)
        pv += net / Math.pow(1 + rPostVal, t + 1)
      }
      earlyNeeded = pv
    }
  }

  const shortfallNonretAtRet = Math.max(0, earlyNeeded - projNonretAtRet)

  // compute annual non-ret saving needed to reach shortfall at retirement
  let neededNonretAnnual = 0
  const n = yearsToRetire
  const rpre = rPrePct
  if (shortfallNonretAtRet > 0) {
    if (n === 0) {
      neededNonretAnnual = shortfallNonretAtRet
    } else if (rpre > 0) {
      const annFactor = (Math.pow(1 + rpre, n) - 1) / rpre
      neededNonretAnnual = shortfallNonretAtRet / annFactor
    } else {
      neededNonretAnnual = shortfallNonretAtRet / n
    }
  }



  // compute remaining total corpus shortfall at retirement after projected balances and non-ret shortfall
  const remainingTotalAtRet = Math.max(0, targetCorpus - (projRetAtRet + projNonretAtRet + shortfallNonretAtRet))

  // compute additional retirement annual contribution needed to cover remainingTotalAtRet
  let additionalRetAnnual = 0
  if (remainingTotalAtRet > 0) {
    if (n === 0) {
      additionalRetAnnual = remainingTotalAtRet
    } else if (rpre > 0) {
      const annFactor = (Math.pow(1 + rpre, n) - 1) / rpre
      additionalRetAnnual = remainingTotalAtRet / annFactor
    } else {
      additionalRetAnnual = remainingTotalAtRet / n
    }
  }
  // allocate recommended additional retirement savings by priority:
  // 1) employee 401(k) up to employer match (to capture employer match)
  // 2) IRA up to IRA_LIMIT
  // 3) 401(k) beyond match up to 401K_LIMIT
  const IRA_LIMIT = 15000
  const FOUR01K_LIMIT = 22500

  const grossPay = parseNumber(salary) + parseNumber(bonus)
  let remainingNeed = additionalRetAnnual

  // Step 1: cover via employee 401(k) up to employer match percent (dollar-for-dollar assumed)
  const employerMatchCap = grossPay * (employerMatchPctNum / 100)
  let emp401kDollarForMatch = 0
  let emp401kPctForMatch = 0
  let employerMatchDollarApplied = 0
  const employeeCapDollar = Math.max(0, parseNumber(four01kLimit))
  if (grossPay > 0 && employerMatchCap > 0 && remainingNeed > 0) {
    // Simple allocation to capture employer match first:
    // Employee contributes up to the employer match dollar amount (but not exceeding employee cap or remaining need).
    emp401kDollarForMatch = Math.min(grossPay, employeeCapDollar, employerMatchCap, remainingNeed / 2)
    emp401kPctForMatch = (emp401kDollarForMatch / grossPay) * 100
    if (emp401kDollarForMatch < employeeCapDollar) {
      emp401kPctForMatch = Math.ceil(emp401kPctForMatch)
      emp401kDollarForMatch = Math.min(grossPay * (emp401kPctForMatch / 100), employeeCapDollar)
      if (emp401kDollarForMatch == employeeCapDollar) {
        emp401kPctForMatch = (emp401kDollarForMatch / grossPay) * 100
      }
    }
    employerMatchDollarApplied = Math.min(employerMatchCap, emp401kDollarForMatch)
    remainingNeed = Math.max(0, remainingNeed - (emp401kDollarForMatch + employerMatchDollarApplied))
    // compute percent for display (allow fractional percent)
  }

  // Step 2: IRA up to configured limit (default to 7500 if field empty)
  let recommendedIra = Math.min(parseNumber(iraLimit, 7500), remainingNeed)
  remainingNeed = Math.max(0, remainingNeed - recommendedIra)

  // Step 3: 401(k) beyond match up to FOUR01K_LIMIT (employee deferral limit)
  const emp401kDollarExtraRec = Math.min(remainingNeed, four01kLimit - emp401kDollarForMatch)
  remainingNeed = Math.max(0, remainingNeed - emp401kDollarExtraRec)

  // totals for recommendations
  let recommended401kDollar = emp401kDollarForMatch + emp401kDollarExtraRec
  if (recommended401kDollar < employeeCapDollar && recommended401kDollar > 0) {
    let oldVal = recommended401kDollar
    let recommendedPct = (recommended401kDollar / grossPay) * 100
    recommendedPct = Math.ceil(recommendedPct)
    recommended401kDollar = Math.min(employeeCapDollar, grossPay * (recommendedPct / 100))
    if (recommended401kDollar != oldVal) {
      recommendedIra = Math.max(0, recommendedIra - (recommended401kDollar - oldVal))
    }
  }
  const rec401kDollarUsed = recommended401kDollar
  const recommended401kPct = grossPay > 0 ? (recommended401kDollar / grossPay) * 100 : 0
  const recommendedEmployerMatchDollar = employerMatchDollarApplied
  // Recompute employer match based on the final used employee contribution
  const recEmployerMatchDollarUsed = Math.min(employerMatchCap, rec401kDollarUsed)

  // If rounding increased retirement contributions, reduce the non-ret annual need accordingly
  const deltaEmployee = rec401kDollarUsed - recommended401kDollar
  const deltaMatch = recEmployerMatchDollarUsed - recommendedEmployerMatchDollar
  const totalDeltaRet = Math.max(0, deltaEmployee + deltaMatch)
  if (totalDeltaRet > 0) {
    neededNonretAnnual = Math.max(0, (neededNonretAnnual || 0) - totalDeltaRet)
  }

  // If we couldn't allocate the full needed retirement annual amount (due to caps),
  // shift the remaining annual need into non-retirement annual savings so the
  // overall annual total still meets the required `additionalRetAnnual`.
  if (remainingNeed > 0) {
    neededNonretAnnual = (neededNonretAnnual || 0) + remainingNeed
    // remainingNeed consumed into non-ret savings
    remainingNeed = 0
  }

  // compute projected balances if user follows the recommendations (with any
  // leftover moved to non-ret savings)
  const { ret: projRetAtRetWithRec, nonret: projNonretAtRetWithRec } = projectBalancesWithRecommendations(
    neededNonretAnnual,
    rec401kDollarUsed,
    recEmployerMatchDollarUsed,
    recommendedIra
  )

  // simulate full timeline to a target age (including inflation-adjusted withdrawals), returns {retBal, nonretBal}
  function simulateToAge(targetAge, additionalNonRetAnnual = 0) {
    let retBal = parseNumber(retirementAccounts)
    let nonretBal = parseNumber(nonRetirement)
    const ratePre = rPrePct
    const ratePost = rPostPct
    const g = inflationPct
    for (let age = curAgeNum; age < targetAge; age++) {
      const rate = age < retirementAgeNum ? ratePre : ratePost
      // growth
      retBal = retBal * (1 + rate)
      nonretBal = nonretBal * (1 + rate)

      if (age < retirementAge) {
        // end of year contributions
        retBal += annualRetirementContrib
        nonretBal += (annualNonRetContrib + additionalNonRetAnnual)
      } else {
        // withdrawals at end of year
        const yearsSinceRet = age - retirementAgeNum
        // compute effective withdrawal accounting for pension and SS with their own inflation
        const baseWithdrawal = withdrawalVal * Math.pow(1 + g, Math.max(0, yearsSinceRet))
        const pensionAdjLocal = pensionAnnual * Math.pow(1 + fixedIncomeInflationPct, Math.max(0, yearsSinceRet))
        let ssAdjLocal = 0
        const ageSinceSS = age - ssStartAgeNum
        if (age >= ssStartAgeNum) {
          ssAdjLocal = ssAnnual * Math.pow(1 + fixedIncomeInflationPct, Math.max(0, ageSinceSS))
        }
        let toWithdraw = Math.max(0, baseWithdrawal - pensionAdjLocal - ssAdjLocal)
        // Prioritize non-retirement accounts when possible (including after penalty-free age)
        if (nonretBal >= toWithdraw) {
          nonretBal -= toWithdraw
          toWithdraw = 0
        } else {
          toWithdraw -= nonretBal
          nonretBal = 0
        }
        if (toWithdraw > 0) {
          retBal = Math.max(0, retBal - toWithdraw)
          toWithdraw = 0
        }
      }
    }
    return { retBal, nonretBal }
  }

  const totalsAtLastAge = simulateToAge(lastAgeNum, neededNonretAnnual)



  return (
    <div className="container">
      <h1>Retirement Goal Calculator</h1>

      <div className="controls">
        <div className="inputs-header">
          <h2 style={{margin:0}}>Profile & Assumptions</h2>
        </div>

        <div className="section">
          <div className="section-title">Profile</div>
          <div className="row-inline">
            <div className="field">
              <label>Current age</label>
              <input type="number" value={currentAge} onChange={e => setCurrentAge(e.target.value)} placeholder="40" />
            </div>
            <div className="field">
              <label>Target retirement age</label>
              <input type="number" value={retirementAge} onChange={e => setRetirementAge(e.target.value)} placeholder="65" />
            </div>
            <div className="field">
              <label>Age funds need to last until</label>
              <input type="number" value={lastAge} onChange={e => setLastAge(e.target.value)} placeholder="95" />
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Income</div>
          <div className="row-inline">
            <div className="field">
              <label>Salary</label>
              <input value={salary} onChange={e => setSalary(e.target.value)} placeholder="80000" />
            </div>
            <div className="field">
              <label>Bonus</label>
              <input value={bonus} onChange={e => setBonus(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label>Employer 401(k) match (%)</label>
              <input value={employerMatchPct} onChange={e => setEmployerMatchPct(e.target.value)} placeholder="3" />
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Current Accounts</div>
          <div className="row-inline">
            <div className="field">
              <label>Retirement accounts</label>
              <input value={retirementAccounts} onChange={e => setRetirementAccounts(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label>Non-retirement investments</label>
              <input value={nonRetirement} onChange={e => setNonRetirement(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Assumptions</div>
          <div className="row-inline">
            <div className="field">
              <label>Expected return before retirement (%)</label>
              <input value={rPre} onChange={e => setRPre(e.target.value)} placeholder="6" />
            </div>
            <div className="field">
              <label>Expected return during retirement (%)</label>
              <input value={rPost} onChange={e => setRPost(e.target.value)} placeholder="4" />
            </div>
          </div>
          <div className="row-inline">
            <div className="field">
              <label>IRA contribution limit</label>
              <input value={iraLimit} onChange={e => setIraLimit(e.target.value)} placeholder="7500" />
            </div>
            <div className="field">
              <label>401(k) contribution limit</label>
              <input value={four01kLimit} onChange={e => setFour01kLimit(e.target.value)} placeholder="24500" />
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Retirement Cashflow</div>
          <div className="row-inline">
            <div className="field">
              <label>Desired initial retirement income</label>
              <input value={withdrawal} onChange={e => setWithdrawal(e.target.value)} placeholder="50000" />
            </div>
            <div className="field">
              <label>Annual retirement income change (%)</label>
              <input value={inflation} onChange={e => setInflation(e.target.value)} placeholder="2" />
            </div>
            <div className="field">
              <label>Penalty-free withdrawal age</label>
              <input type="number" value={penaltyFreeAge} onChange={e => setPenaltyFreeAge(e.target.value)} placeholder="59.5" />
            </div>
          </div>
          <div className="row-inline">
            <div className="field">
              <label>Social Security start age</label>
              <input value={ssStartAge} onChange={e => setSsStartAge(e.target.value)} placeholder="67" />
            </div>
            <div className="field">
              <label>Monthly Social Security benefit</label>
              <input value={monthlySocialSecurity} onChange={e => setMonthlySocialSecurity(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="row-inline">
            <div className="field">
              <label>Monthly pension starting at retirement</label>
              <input value={monthlyPension} onChange={e => setMonthlyPension(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label>Fixed income yearly inflation adjustment (%)</label>
              <input value={fixedIncomeInflation} onChange={e => setFixedIncomeInflation(e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
      </div>

      <div className="results">
        <div className="results-header">
          <h2 style={{margin:0}}>Results</h2>
          <div className="results-meta muted">Years until retirement: <strong>{Math.max(0, yearsToRetire)}</strong> · Years in retirement: <strong>{Math.max(0, yearsInRetirement)}</strong></div>
        </div>
        <div className="results-grid">

          <div className="result-group">
            <div className="result-item result-item-header">
              <div className="result-total-value">${fmt(projRetAtRetWithRec + projNonretAtRetWithRec)}</div>
              <div className="result-key header-label">Target balance at retirement</div>
            </div>
            <div className="result-item"><div className="result-key muted-key">Retirement accounts</div><div className="result-value result-value-small">${fmt(projRetAtRetWithRec)}</div></div>
            <div className="result-item"><div className="result-key muted-key">Other accounts</div><div className="result-value result-value-small">${fmt(projNonretAtRetWithRec)}</div></div>
          </div>

          <div className="result-group">
            <div className="result-item result-item-header">
              <div className="result-total-value">${fmt((neededNonretAnnual || 0) + (recommendedIra || 0) + (rec401kDollarUsed || 0) + (recEmployerMatchDollarUsed || 0))}</div>
              <div className="result-key header-label">Needed annual savings</div>
            </div>
            <div className="result-item"><div className="result-key muted-key">Non-retirement</div><div className="result-value result-value-small">${fmt(neededNonretAnnual)}</div></div>
            <div className="result-item"><div className="result-key muted-key">IRA</div><div className="result-value result-value-small">${fmt(recommendedIra)}</div></div>
            <div className="result-item"><div className="result-key muted-key">401(k)</div><div className="result-value result-value-small">{rec401kDollarUsed > 0 ? `${Math.round(recommended401kPct * 100) / 100}% ($${fmt(rec401kDollarUsed)})` : '—'}</div></div>
            <div className="result-item"><div className="result-key muted-key">Employer match</div><div className="result-value result-value-small">${fmt(recEmployerMatchDollarUsed)}</div></div>
          </div>
        </div>

        {/* include the timeline chart inside Results and make it responsive */}
        <div style={{marginTop:18}}>
          <TimelineChart
            currentAge={curAgeNum}
            lastAge={lastAgeNum}
            retirementAge={retirementAgeNum}
            penaltyFreeAge={penaltyFreeAgeNum}
            initialRet={parseNumber(retirementAccounts, 0)}
            initialNonRet={parseNumber(nonRetirement, 0)}
            annualRetContrib={annualRetirementContrib}
            annualNonRetContrib={annualNonRetContrib + neededNonretAnnual}
            withdrawal={withdrawalVal}
            inflation={inflationPct}
            rPre={rPrePct}
            rPost={rPostPct}
            rec401kDollar={rec401kDollarUsed}
            recEmployerMatchDollar={recEmployerMatchDollarUsed}
            recIraDollar={recommendedIra}
            pensionAnnual={pensionAnnual}
            ssAnnual={ssAnnual}
            ssStartAge={ssStartAgeNum}
            fixedIncomeInflation={fixedIncomeInflationPct}
          />
        </div>
      </div>
    </div>
  )
}


function TimelineChart({ currentAge, lastAge, retirementAge, penaltyFreeAge, initialRet, initialNonRet, annualRetContrib, annualNonRetContrib, withdrawal, inflation, rPre, rPost, rec401kDollar = 0, recEmployerMatchDollar = 0, recIraDollar = 0, pensionAnnual = 0, ssAnnual = 0, ssStartAge = 0, fixedIncomeInflation = 0 }) {
  const endAge = Math.max(lastAge, penaltyFreeAge, retirementAge)
  const years = Math.max(0, endAge - currentAge)

  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [width, setWidth] = useState(720)

  // helper to simulate year-by-year points given annual retirement and non-ret contributions
  function simulatePoints(annualRetContribLocal, annualNonRetContribLocal) {
    const pts = []
    let retBal = initialRet
    let nonretBal = initialNonRet
    for (let i = 0; i <= years; i++) {
      const age = currentAge + i
      pts.push({ age, retBal, nonretBal })
      if (i === years) break
      const rate = age < retirementAge ? rPre : rPost
      retBal = retBal * (1 + rate)
      nonretBal = nonretBal * (1 + rate)
      if (age < retirementAge) {
        retBal += annualRetContribLocal
        nonretBal += annualNonRetContribLocal
      } else {
        const yearsSinceRet = age - Number(retirementAge)
        const baseW = withdrawal * Math.pow(1 + inflation, Math.max(0, yearsSinceRet))
        const pensionAdj = pensionAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, yearsSinceRet))
        let ssAdj = 0
        if (age >= ssStartAge) {
          const sinceSS = age - ssStartAge
          ssAdj = ssAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, sinceSS))
        }
        let toWithdraw = Math.max(0, baseW - pensionAdj - ssAdj)
        // Prefer non-retirement funds first (including after penalty-free age)
        if (nonretBal >= toWithdraw) {
          nonretBal -= toWithdraw
          toWithdraw = 0
        } else {
          toWithdraw -= nonretBal
          nonretBal = 0
        }
        if (toWithdraw > 0) {
          retBal = Math.max(0, retBal - toWithdraw)
        }
      }
    }
    return pts
  }

  const recAnnualRetContrib = (rec401kDollar || 0) + (recEmployerMatchDollar || 0) + (recIraDollar || 0)
  const points = simulatePoints(recAnnualRetContrib, annualNonRetContrib)

  // local simulator to compute totals at final age (post-year balances)
  function simulateToAgeLocal(targetAge) {
    let retBal = initialRet
    let nonretBal = initialNonRet
    const ratePre = rPre
    const ratePost = rPost
    for (let age = Number(currentAge); age < targetAge; age++) {
      const rate = age < retirementAge ? ratePre : ratePost
      retBal = retBal * (1 + rate)
      nonretBal = nonretBal * (1 + rate)

      if (age < retirementAge) {
        retBal += annualRetContrib
        nonretBal += annualNonRetContrib
      } else {
        const yearsSinceRet = age - Number(retirementAge)
        const baseW = withdrawal * Math.pow(1 + inflation, Math.max(0, yearsSinceRet))
        const pensionAdj = pensionAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, yearsSinceRet))
        let ssAdj = 0
        if (age >= ssStartAge) {
          const sinceSS = age - ssStartAge
          ssAdj = ssAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, sinceSS))
        }
        let toWithdraw = Math.max(0, baseW - pensionAdj - ssAdj)
        // Prefer non-retirement funds first (including after penalty-free age)
        if (nonretBal >= toWithdraw) {
          nonretBal -= toWithdraw
          toWithdraw = 0
        } else {
          toWithdraw -= nonretBal
          nonretBal = 0
        }
        if (toWithdraw > 0) {
          retBal = Math.max(0, retBal - toWithdraw)
        }
      }
    }
    return { retBal, nonretBal }
  }

  const totalsAtLastAge = simulateToAgeLocal(Number(lastAge))

  function handleMouseMove(e) {
    if (!points.length) return
    const rect = svgRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const plotW = Math.max(320, width) - pad * 2
    const ratio = Math.min(1, Math.max(0, (mx - pad) / plotW))
    const idx = Math.round(ratio * (points.length - 1))
    const p = points[idx]
    if (!p) { setTooltip(null); return }
    const total = p.retBal + p.nonretBal
    const svgX = x(idx)
    const screenX = rect.left + svgX
    // place tooltip at the top of the chart area (horizontal follows cursor)
    const screenTop = rect.top + 8
    // compute withdrawal totals and investment-only withdrawals at this age
    let baseW = 0
    let investW = 0
    if (p.age >= retirementAge) {
      const yearsSinceRet = p.age - Number(retirementAge)
      baseW = withdrawal * Math.pow(1 + inflation, Math.max(0, yearsSinceRet))
      const pensionAdj = pensionAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, yearsSinceRet))
      let ssAdj = 0
      if (p.age >= ssStartAge) {
        const sinceSS = p.age - ssStartAge
        ssAdj = ssAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, sinceSS))
      }
      investW = Math.max(0, baseW - pensionAdj - ssAdj)
    }
    setTooltip({ idx, age: p.age, ret: p.retBal, nonret: p.nonretBal, total, withdrawal: baseW, investWithdrawal: investW, x: svgX, screenX, topY: screenTop })
  }

  function handleMouseLeave() { setTooltip(null) }

  function handleTouchStart(e) {
    if (!points.length) return
    // prevent scrolling while interacting with the chart
    try { e.preventDefault() } catch (er) {}
    handleTouchMove(e)
  }

  function handleTouchMove(e) {
    if (!points.length) return
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
    if (!touch) return
    const rect = svgRef.current.getBoundingClientRect()
    const mx = touch.clientX - rect.left
    const plotW = Math.max(320, width) - pad * 2
    const ratio = Math.min(1, Math.max(0, (mx - pad) / plotW))
    const idx = Math.round(ratio * (points.length - 1))
    const p = points[idx]
    if (!p) { setTooltip(null); return }
    const total = p.retBal + p.nonretBal
    const svgX = x(idx)
    const screenX = rect.left + svgX
    const screenTop = rect.top + 8
    let baseW = 0
    let investW = 0
    if (p.age >= retirementAge) {
      const yearsSinceRet = p.age - Number(retirementAge)
      baseW = withdrawal * Math.pow(1 + inflation, Math.max(0, yearsSinceRet))
      const pensionAdj = pensionAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, yearsSinceRet))
      let ssAdj = 0
      if (p.age >= ssStartAge) {
        const sinceSS = p.age - ssStartAge
        ssAdj = ssAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, sinceSS))
      }
      investW = Math.max(0, baseW - pensionAdj - ssAdj)
    }
    setTooltip({ idx, age: p.age, ret: p.retBal, nonret: p.nonretBal, total, withdrawal: baseW, investWithdrawal: investW, x: svgX, screenX, topY: screenTop })
  }

  function handleTouchEnd() {
    setTooltip(null)
  }

  const height = 260
  const pad = 40

  // measure container width to make the chart responsive
  useEffect(() => {
    function measure() {
      try {
        const w = containerRef.current ? Math.max(320, Math.floor(containerRef.current.getBoundingClientRect().width)) : 720
        setWidth(w)
      } catch (e) {
        setWidth(720)
      }
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => measure())
      if (containerRef.current) ro.observe(containerRef.current)
      return () => ro.disconnect()
    } else {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
  }, [])

  const maxVal = Math.max(...points.map(p => p.retBal + p.nonretBal)) || 1

  // choose a 'nice' step for y-axis and round the y-axis maximum
  function chooseStep(max) {
    if (!max || max <= 0) return 100000
    const candidates = [100000000, 50000000, 10000000, 5000000, 1000000, 500000, 250000, 100000, 50000, 25000, 10000, 5000, 1000, 500, 100]
    for (const s of candidates) {
      const ticks = Math.ceil(max / s)
      if (ticks >= 3 && ticks <= 8) return s
    }
    const p = Math.pow(10, Math.floor(Math.log10(max / 4 || 1)))
    return p
  }
  const step = chooseStep(maxVal)
  const yMaxRounded = Math.ceil(maxVal / step) * step

  const yValues = []
  for (let v = 0; v <= yMaxRounded; v += step) yValues.push(v)

  const plotWidth = Math.max(320, width) - pad * 2
  const x = i => pad + (i / Math.max(1, years)) * plotWidth
  const y = v => height - pad - (v / yMaxRounded) * (height - pad * 2)

  const pathFor = (key, pts = points) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p[key])}`).join(' ')

  const atAge = a => {
    if (!points.length) return null
    const exact = points.find(p => p.age === a)
    if (exact) return exact
    // return nearest age if exact not found
    return points.reduce((best, p) => Math.abs(p.age - a) < Math.abs(best.age - a) ? p : best, points[0])
  }

  const retAtRet = atAge(retirementAge)
  const retAtPenalty = atAge(penaltyFreeAge)

  // area path helpers
  const areaPath = (key, pts = points) => {
    if (!pts.length) return ''
    const top = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p[key])}`).join(' ')
    const baseline = `L${x(pts.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
    return `${top} ${baseline}`
  }
  const areaPathRetStack = (pts = points) => {
    if (!pts.length) return ''
    // top line: total (ret+nonret)
    const top = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.retBal + p.nonretBal)}`).join(' ')
    // bottom line: nonret reversed
    const bottom = pts.map((p, i) => `${x(pts.length - 1 - i)},${y(pts[pts.length - 1 - i].nonretBal)}`).join(' ')
    return `${top} L ${bottom} Z`
  }

  // withdrawal line path: show yearly withdrawal amount (inflation-adjusted) from retirement onward
  const withdrawalPath = () => {
    if (!points.length) return ''
    let d = ''
    points.forEach((p, i) => {
      const age = p.age
      if (age < retirementAge) return
      const yearsSinceRet = age - Number(retirementAge)
      const baseW = withdrawal * Math.pow(1 + inflation, Math.max(0, yearsSinceRet))
      const pensionAdj = pensionAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, yearsSinceRet))
      let ssAdj = 0
      if (age >= ssStartAge) {
        const sinceSS = age - ssStartAge
        ssAdj = ssAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, sinceSS))
      }
      const w = baseW // total desired withdrawal (includes fixed incomes separately)
      const cmd = (d === '') ? 'M' : 'L'
      d += `${cmd}${x(i)},${y(w)} `
    })
    return d
  }

  // withdrawal from investments (excludes pension & SS) path (explicitly drawn too)
  const investWithdrawalPath = () => {
    if (!points.length) return ''
    let d = ''
    points.forEach((p, i) => {
      const age = p.age
      if (age < retirementAge) return
      const yearsSinceRet = age - Number(retirementAge)
      const baseW = withdrawal * Math.pow(1 + inflation, Math.max(0, yearsSinceRet))
      const pensionAdj = pensionAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, yearsSinceRet))
      let ssAdj = 0
      if (age >= ssStartAge) {
        const sinceSS = age - ssStartAge
        ssAdj = ssAnnual * Math.pow(1 + fixedIncomeInflation, Math.max(0, sinceSS))
      }
      const investW = Math.max(0, baseW - pensionAdj - ssAdj)
      const cmd = (d === '') ? 'M' : 'L'
      d += `${cmd}${x(i)},${y(investW)} `
    })
    return d
  }




  // x-axis tick selection:
  // - always include current age and ending age
  // - prefer 5-year ticks, fall back to 10-year if space is tight
  // - use even multiples and avoid ticks too close to the ends
  const xTickAges = []
  const curAge = Number(currentAge)
  const lastAgeNum = Number(lastAge)
  xTickAges.push(curAge)
  if (lastAgeNum !== curAge) xTickAges.push(lastAgeNum)

  const yearsRange = Math.max(1, lastAgeNum - curAge)
  const pxPerYear = plotWidth / yearsRange
  let interval = 5
  if (pxPerYear * 5 < 48) interval = 10

  const margin = Math.max(1, Math.floor(interval / 2))
  const firstMultiple = Math.ceil((curAge + margin) / interval) * interval
  const lastMultiple = Math.floor((lastAgeNum - margin) / interval) * interval
  for (let a = firstMultiple; a <= lastMultiple; a += interval) xTickAges.push(a)
  xTickAges.sort((a, b) => a - b)
  const xTickSet = new Set(xTickAges)

  return (
    <div style={{marginTop:20}} ref={containerRef}>
      <h3>Accounts over time</h3>
      <svg ref={svgRef} className="chart" width="100%" viewBox={`0 0 ${Math.max(320, width)} ${height}`} height={height} preserveAspectRatio="xMidYMid meet" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <g>
          {/* y axis grid and labels */}
          {yValues.map((val, i) => (
            <g key={i}>
              <line x1={pad} x2={width - pad} y1={y(val)} y2={y(val)} stroke="#eee" />
              <text x={6} y={y(val) + 4} fontSize={10}>{fmt(val)}</text>
            </g>
          ))}

          {/* recommended scenario only: non-ret bottom, retirement on top */}
          <path d={areaPath('nonretBal', points)} fill="#0b8a3e" opacity={0.95} />
          <path d={areaPathRetStack(points)} fill="#0b79f7" opacity={0.85} />
          {/* withdrawal amount line (solid) */}
          <path d={withdrawalPath()} fill="none" stroke="#e65c5c" strokeWidth={2} />
          <path d={investWithdrawalPath()} fill="none" stroke="#f39c12" strokeWidth={2} strokeDasharray="6 4" />

          {/* Social Security start age marker (dashed vertical) */}
          {ssStartAge && ssStartAge !== retirementAge && ssStartAge >= currentAge && ssStartAge <= endAge && (
            (() => {
              const idxSS = ssStartAge - currentAge
              const xSS = x(idxSS)
              return (
                <g key="ss-start">
                  <line x1={xSS} x2={xSS} y1={pad} y2={height - pad} stroke="#666" strokeDasharray="4 4" strokeWidth={1} opacity={0.9} />
                </g>
              )
            })()
          )}

          {/* hover markers */}
          {tooltip && (
            <g>
              <line x1={tooltip.x} x2={tooltip.x} y1={pad} y2={height - pad} stroke="#333" strokeDasharray="4 3" opacity={0.85} strokeWidth={1.5} />
              {/* retirement marker placed at top of retirement band (total) so it visually sits on the stacked area */}
              <circle cx={tooltip.x} cy={y(tooltip.total)} r={4} fill="#0b79f7" stroke="#fff" />
              <circle cx={tooltip.x} cy={y(tooltip.nonret)} r={4} fill="#0b8a3e" stroke="#fff" />
              {/* withdrawal marker */}
              {typeof tooltip.withdrawal === 'number' && tooltip.withdrawal > 0 && (
                <circle cx={tooltip.x} cy={y(tooltip.withdrawal)} r={4} fill="#e65c5c" stroke="#fff" />
              )}
            </g>
          )}

          {/* x axis ticks (ages) */}
          {points.map((p, i) => xTickSet.has(p.age) ? (
            <text key={i} x={x(i)} y={height - pad + 14} fontSize={10} textAnchor="middle">{p.age}</text>
          ) : null)}
        </g>

        {/* vertical markers */}
        {retAtRet && (
          <g>
            <line x1={x(retAtRet.age - currentAge)} x2={x(retAtRet.age - currentAge)} y1={pad} y2={height - pad} stroke="#0b79f7" strokeDasharray="6 4" opacity={0.8} strokeWidth={1.5} />
          </g>
        )}

        {retAtPenalty && Number(penaltyFreeAge) >= Number(retirementAge) && (
          <g>
            <line x1={x(retAtPenalty.age - currentAge)} x2={x(retAtPenalty.age - currentAge)} y1={pad} y2={height - pad} stroke="#8a3e8a" strokeDasharray="6 4" opacity={0.8} strokeWidth={1.5} />
          </g>
        )}

        {/* legend removed from SVG; rendered below for better responsiveness */}
      </svg>

      {/* tooltip element positioned over svg */}
      {tooltip && (
      <div style={{position:'fixed', left: tooltip.screenX + 12, top: tooltip.topY, pointerEvents:'none', zIndex:9999}}>
          <div className="tooltip-card">
            <div style={{fontSize:12, fontWeight:600, marginBottom:6}}>Age {tooltip.age}</div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
              <div style={{width:10,height:10,borderRadius:6,background:'#0b79f7'}} />
              <div style={{fontSize:12}}>Retirement: ${fmt(tooltip.ret)}</div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4}}>
              <div style={{width:10,height:10,borderRadius:6,background:'#0b8a3e'}} />
              <div style={{fontSize:12}}>Non-retirement: ${fmt(tooltip.nonret)}</div>
            </div>
            <div style={{fontSize:12, fontWeight:700, paddingBottom:6}}>Total investments: ${fmt(tooltip.total)}</div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
              <div style={{width:10,height:10,borderRadius:6,background:'#e65c5c'}} />
              <div style={{fontSize:12}}>Total income: ${fmt(tooltip.withdrawal || 0)}</div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
              <div style={{width:10,height:10,borderRadius:6,background:'#f39c12'}} />
              <div style={{fontSize:12}}>Withdrawals: ${fmt(tooltip.investWithdrawal || 0)}</div>
            </div>
          </div>
        </div>
      )}

      {/* HTML legend placed below SVG for responsive wrapping */}
      <div style={{display:'flex', gap:16, flexWrap:'wrap', marginTop:12, alignItems:'center'}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div style={{width:2, height:16, background:'#0b79f7', borderRadius:2}} />
          <div style={{fontSize:13}}>Retirement age</div>
        </div>
        {Number(penaltyFreeAge) >= Number(retirementAge) && (
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div style={{width:2, height:16, background:'#8a3e8a', borderRadius:2}} />
            <div style={{fontSize:13}}>Penalty-free age</div>
          </div>
        )}
        {ssStartAge && ssStartAge !== retirementAge && ssStartAge >= currentAge && ssStartAge <= endAge && (
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div style={{width:0,height:16,borderLeft:'2px dashed #666'}} />
            <div style={{fontSize:13}}>Social Security start</div>
          </div>
        )}
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div style={{width:28, height:10, background:'#0b79f7', borderRadius:4}} />
          <div style={{fontSize:13}}>Retirement accounts</div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div style={{width:28, height:10, background:'#0b8a3e', borderRadius:4}} />
          <div style={{fontSize:13}}>Non-retirement accounts</div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div style={{width:28, height:2, background:'#e65c5c', borderRadius:2}} />
          <div style={{fontSize:13}}>Total retirement income</div>
        </div>
      </div>


    </div>
  )
}
