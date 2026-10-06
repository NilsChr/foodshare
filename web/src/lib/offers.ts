import { useEffect, useState } from 'react'
import { locale } from './i18n'
import { col, pb, type Chain, type Offer } from './pb'

const OFFER_FIELDS = 'id,chain,heading,description,price,pre_price,discount_pct,size_from,size_to,unit,pieces,image,run_till,category'

/**
 * Every chain, plus this week's offers from the chosen ones. Offers are replaced nightly
 * on the server, so they are loaded once per chain selection instead of kept live.
 */
export function useOffers(chainIds: string[]) {
  const [chains, setChains] = useState<Chain[]>([])
  const [offers, setOffers] = useState<Offer[]>([])

  useEffect(() => {
    col.chains().getFullList({ sort: 'name' }).then(setChains).catch(() => setChains([]))
  }, [])

  const key = [...chainIds].sort().join(',')
  useEffect(() => {
    if (!key) return
    let alive = true
    const chainFilter = key.split(',').map((id) => pb.filter('chain = {:id}', { id })).join(' || ')
    col.offers()
      .getFullList({ filter: `run_from <= @now && run_till >= @now && (${chainFilter})`, fields: OFFER_FIELDS, batch: 1000 })
      .then((r) => alive && setOffers(r))
      .catch(() => alive && setOffers([]))
    return () => {
      alive = false
    }
  }, [key])

  // No stores chosen: nothing to show, whatever an earlier selection loaded.
  return { chains, offers: key ? offers : [] }
}

/** "29,90 kr"; `whole` rounds to "45 kr" for estimates. */
export const formatPrice = (n: number, whole = false) =>
  n.toLocaleString(locale, { style: 'currency', currency: 'NOK', ...(whole && { minimumFractionDigits: 0, maximumFractionDigits: 0 }) })

/** What the offer saves against the flyer's before-price; 0 when the flyer gives none. */
export const saving = (o: Offer) => (o.pre_price > o.price ? o.pre_price - o.price : 0)
