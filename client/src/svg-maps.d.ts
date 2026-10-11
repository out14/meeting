// @svg-maps/south-korea 의 타입이 참조하는 공용 타입 (패키지에 포함돼 있지 않다)
declare module 'svg-maps__common' {
  export interface Location {
    id: string
    name: string
    path: string
  }

  export interface Map {
    label: string
    viewBox: string
    locations: Location[]
  }
}
