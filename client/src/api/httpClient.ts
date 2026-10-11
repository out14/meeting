import axios, { type AxiosRequestConfig } from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const getErrorMessage = (error: unknown) =>
  error instanceof HttpError ? error.message : '요청에 실패했습니다. 잠시 후 다시 시도해 주세요.'

const client = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response) {
    const data = error.response.data as { message?: string } | undefined
    return Promise.reject(new HttpError(error.response.status, data?.message ?? error.message))
  }

  return Promise.reject(error)
})

export const httpClient = {
  get: <T>(path: string, config?: AxiosRequestConfig) => client.get<T>(path, config).then((res) => res.data),
  post: <T>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
    client.post<T>(path, body, config).then((res) => res.data),
  put: <T>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
    client.put<T>(path, body, config).then((res) => res.data),
  patch: <T>(path: string, body?: unknown, config?: AxiosRequestConfig) =>
    client.patch<T>(path, body, config).then((res) => res.data),
  delete: <T>(path: string, config?: AxiosRequestConfig) => client.delete<T>(path, config).then((res) => res.data),
}
