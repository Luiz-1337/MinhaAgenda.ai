/**
 * Snapshot of a recent service performed for the customer (denormalized from Trinks).
 * Stored as JSONB array, max 5 most recent entries.
 */
export interface RecentServiceSnapshot {
  serviceName: string
  professionalName?: string
  date: string  // ISO 8601
  amount?: number
}

export interface CustomerTrinksProfileProps {
  id: string
  customerId: string
  salonId: string
  trinksClientId?: string | null
  totalSpent: number
  averageTicket: number
  visitCount90Days: number
  visitCount365Days: number
  lastVisitAt?: Date | null
  firstVisitAt?: Date | null
  tags: string[]
  recentServices: RecentServiceSnapshot[]
  vipScore: number  // 0-100
  trinksNotFound: boolean
  syncedAt: Date
  createdAt?: Date
  updatedAt?: Date
}

const VIP_SCORE_THRESHOLD = 70
const NOT_FOUND_RETRY_DAYS = 7

/**
 * Cliente 360° profile fetched from Trinks API.
 * Cached in customer_trinks_profile table; refreshed by daily cron and on-demand worker.
 */
export class CustomerTrinksProfile {
  readonly id: string
  readonly customerId: string
  readonly salonId: string
  readonly trinksClientId: string | null
  readonly totalSpent: number
  readonly averageTicket: number
  readonly visitCount90Days: number
  readonly visitCount365Days: number
  readonly lastVisitAt: Date | null
  readonly firstVisitAt: Date | null
  readonly tags: ReadonlyArray<string>
  readonly recentServices: ReadonlyArray<RecentServiceSnapshot>
  readonly vipScore: number
  readonly trinksNotFound: boolean
  readonly syncedAt: Date
  readonly createdAt: Date
  readonly updatedAt: Date

  private constructor(props: CustomerTrinksProfileProps) {
    this.id = props.id
    this.customerId = props.customerId
    this.salonId = props.salonId
    this.trinksClientId = props.trinksClientId ?? null
    this.totalSpent = props.totalSpent
    this.averageTicket = props.averageTicket
    this.visitCount90Days = props.visitCount90Days
    this.visitCount365Days = props.visitCount365Days
    this.lastVisitAt = props.lastVisitAt ?? null
    this.firstVisitAt = props.firstVisitAt ?? null
    this.tags = Object.freeze([...props.tags])
    this.recentServices = Object.freeze([...props.recentServices])
    this.vipScore = props.vipScore
    this.trinksNotFound = props.trinksNotFound
    this.syncedAt = props.syncedAt
    this.createdAt = props.createdAt ?? new Date()
    this.updatedAt = props.updatedAt ?? new Date()
  }

  static create(props: CustomerTrinksProfileProps): CustomerTrinksProfile {
    return new CustomerTrinksProfile(props)
  }

  static fromPersistence(props: CustomerTrinksProfileProps): CustomerTrinksProfile {
    return new CustomerTrinksProfile(props)
  }

  isVIP(): boolean {
    return this.vipScore >= VIP_SCORE_THRESHOLD || this.tags.some((t) => t.toLowerCase().includes('vip'))
  }

  /**
   * Returns true when the profile snapshot is older than the given threshold and
   * should be refreshed before being trusted as accurate.
   *
   * For trinks_not_found=true profiles, uses a longer retry window to avoid
   * hammering the Trinks API for customers that simply don't exist there.
   */
  isStale(maxAgeHours: number): boolean {
    const ageMs = Date.now() - this.syncedAt.getTime()

    if (this.trinksNotFound) {
      return ageMs > NOT_FOUND_RETRY_DAYS * 24 * 60 * 60 * 1000
    }

    return ageMs > maxAgeHours * 60 * 60 * 1000
  }

  daysSinceLastVisit(): number | null {
    if (!this.lastVisitAt) return null
    const ageMs = Date.now() - this.lastVisitAt.getTime()
    return Math.floor(ageMs / (24 * 60 * 60 * 1000))
  }

  hasTag(tag: string): boolean {
    const target = tag.toLowerCase()
    return this.tags.some((t) => t.toLowerCase() === target)
  }

  /**
   * VIP score heuristic: combines monetary value (60%) with frequency (40%).
   * Returns a value in [0, 100].
   */
  static computeVipScore(input: {
    totalSpent: number
    visitCount365Days: number
  }): number {
    // Money component: R$ 2000+ in last year = max
    const moneyScore = Math.min(input.totalSpent / 2000, 1) * 60
    // Frequency component: 12+ visits/year = max
    const frequencyScore = Math.min(input.visitCount365Days / 12, 1) * 40
    return Math.round(moneyScore + frequencyScore)
  }

  toPersistence(): CustomerTrinksProfileProps {
    return {
      id: this.id,
      customerId: this.customerId,
      salonId: this.salonId,
      trinksClientId: this.trinksClientId,
      totalSpent: this.totalSpent,
      averageTicket: this.averageTicket,
      visitCount90Days: this.visitCount90Days,
      visitCount365Days: this.visitCount365Days,
      lastVisitAt: this.lastVisitAt,
      firstVisitAt: this.firstVisitAt,
      tags: [...this.tags],
      recentServices: [...this.recentServices],
      vipScore: this.vipScore,
      trinksNotFound: this.trinksNotFound,
      syncedAt: this.syncedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}
