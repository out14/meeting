import { useLayoutEffect, useRef, useState } from 'react'
import classNames from 'classnames'
import southKorea from '@svg-maps/south-korea'
import { regionNameByMapId, type RegionName } from '@src/utils/regions'

interface RegionMapProps {
  // 시·도별 득표 수 (많을수록 진하게)
  counts: Partial<Record<RegionName, number>>
  selected: RegionName[]
  confirmed: string | null
  disabled: boolean
  onToggle: (region: RegionName) => void
}

// 지도에 이름을 쓰는 시·도 (면적이 좁은 특별·광역시는 겹쳐서 버튼으로만 고른다)
const LABELED = new Set(['gyeonggi', 'gangwon', 'north-chungcheong', 'south-chungcheong', 'north-jeolla', 'south-jeolla', 'north-gyeongsang', 'south-gyeongsang', 'jeju'])

// 한반도(남한) 시·도 지도 (출처 표시는 CC BY 4.0 조건이라 사이트 하단 RootLayout 에 둔다). 시·도를 누를 때마다 선택/해제된다 (여러 곳 선택)
export function RegionMap({ counts, selected, confirmed, disabled, onToggle }: RegionMapProps) {
  const maxCount = Math.max(1, ...Object.values(counts).map((count) => count ?? 0))
  const pathRefs = useRef(new Map<string, SVGPathElement>())
  // 이름을 놓을 위치: 각 시·도 경계 상자의 가운데 (그려진 뒤에 잰다)
  const [labelPositions, setLabelPositions] = useState<{ id: string; x: number; y: number }[]>([])

  useLayoutEffect(() => {
    setLabelPositions(
      [...pathRefs.current].flatMap(([id, path]) => {
        if (!LABELED.has(id)) return []
        const box = path.getBBox()
        return [{ id, x: box.x + box.width / 2, y: box.y + box.height / 2 }]
      }),
    )
  }, [])

  return (
    <figure className="region-map">
      <svg viewBox={southKorea.viewBox} role="group" aria-label="전국 시·도 지도">
        {southKorea.locations.map((location) => {
          const region = regionNameByMapId.get(location.id)
          if (!region) return null
          const count = counts[region] ?? 0
          const isSelected = selected.includes(region)
          return (
            <path
              key={location.id}
              ref={(element) => {
                if (element) pathRefs.current.set(location.id, element)
              }}
              d={location.path}
              className={classNames('region', { selected: isSelected, confirmed: region === confirmed, disabled })}
              // 득표가 많을수록 진하게 (선택한 곳은 선택 색으로 덮는다)
              style={!isSelected && count ? { fillOpacity: 0.12 + (count / maxCount) * 0.5 } : undefined}
              data-voted={count > 0 || undefined}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-label={`${region} ${count}표`}
              aria-pressed={isSelected}
              onClick={() => !disabled && onToggle(region)}
              onKeyDown={(event) => {
                if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onToggle(region)
                }
              }}
            >
              <title>{`${region} · ${count}표`}</title>
            </path>
          )
        })}
        {labelPositions.map(({ id, x, y }) => (
          <text key={id} x={x} y={y} className="region-label" textAnchor="middle" dominantBaseline="middle">
            {regionNameByMapId.get(id)}
          </text>
        ))}
      </svg>
    </figure>
  )
}
