'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Layout, Menu, Button } from 'antd'
import type { MenuProps } from 'antd'
import {
  FileExcelOutlined,
  FileWordOutlined,
  FilePptOutlined,
  AppstoreOutlined,
  FolderOutlined,
  GithubOutlined,
  MenuOutlined,
  CloseOutlined,
} from '@ant-design/icons'

import ServiceWorkerUninstall from '@/components/ServiceWorkerUninstall'
import './styles.css'
import ServiceWorkerManager from '../ServiceWorkerManager'

const { Sider } = Layout

// 路由常量
const ROUTES = {
  WLLAMA: '/wllama',
  WLLAMA_LOAD_FROM_FILE: '/wllama/load-from-file',
  WLLAMA_LOAD_FROM_URL: '/wllama/load-from-url',
  WLLAMA_LOAD_FROM_CACHE: '/wllama/load-from-cache',
  WLLAMA_CACHE: '/wllama/manager-cache',
} as const

const menuItems: MenuProps['items'] = [
  {
    key: ROUTES.WLLAMA,
    icon: <FileExcelOutlined />,
    label: 'Wllama',
    children: [
      {
        key: ROUTES.WLLAMA_LOAD_FROM_FILE,
        icon: <FolderOutlined />,
        label: 'Load From File',
      },
      {
        key: ROUTES.WLLAMA_LOAD_FROM_URL,
        icon: <FolderOutlined />,
        label: 'Load From URL',
      },
      {
        key: ROUTES.WLLAMA_LOAD_FROM_CACHE,
        icon: <FolderOutlined />,
        label: 'Load From Cache',
      },
      {
        key: ROUTES.WLLAMA_CACHE,
        icon: <FolderOutlined />,
        label: 'Manager Cache',
      },
    ],
  },
 
]

interface StudioLayoutProps {
  children: React.ReactNode
}

export default function StudioLayout({ children }: StudioLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)

  // 客户端挂载后设置
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // 根据路径自动展开对应的菜单并选中菜单项
  useEffect(() => {
    if (!pathname) return

    // 所有可能的路径映射
    const routeMap: Record<string, { selected: string; parent: string }> = {
      [ROUTES.WLLAMA_LOAD_FROM_FILE]: { selected: ROUTES.WLLAMA_LOAD_FROM_FILE, parent: ROUTES.WLLAMA },
      [ROUTES.WLLAMA_LOAD_FROM_URL]: { selected: ROUTES.WLLAMA_LOAD_FROM_URL, parent: ROUTES.WLLAMA },
      [ROUTES.WLLAMA_LOAD_FROM_CACHE]: { selected: ROUTES.WLLAMA_LOAD_FROM_CACHE, parent: ROUTES.WLLAMA },
      [ROUTES.WLLAMA_CACHE]: { selected: ROUTES.WLLAMA_CACHE, parent: ROUTES.WLLAMA },
    }

    // 精确匹配路径
    const match = routeMap[pathname]
    if (match) {
      setOpenKeys([match.parent])
    }
  }, [pathname])

  // 获取当前选中的菜单项
  const getSelectedKeys = (): string[] => {
    if (!pathname) return []
    return [pathname]
  }

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    router.push(key as string)
    // 移动端点击菜单项后自动关闭侧边栏
    if (window.innerWidth <= 768) {
      setSidebarOpen(false)
    }
  }

  const handleOpenChange: MenuProps['onOpenChange'] = (keys) => {
    setOpenKeys(keys)
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const closeSidebar = () => {
    setSidebarOpen(false)
  }

  return (
    <Layout className="studio-layout">
      {/* 移动端遮罩层 */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}

      {/* 移动端菜单按钮 */}
      <Button
        type="text"
        icon={<MenuOutlined />}
        className="mobile-menu-button"
        onClick={toggleSidebar}
        aria-label="切换菜单"
      />

      <Sider
        width={240}
        className={`studio-sidebar ${sidebarOpen ? 'open' : ''}`}
        theme="light"
      >
        <div className="sidebar-header">
          <div className="sidebar-header-content">
            <h2 className="sidebar-title">ai-wllama Studio</h2>
            <Button
              type="text"
              icon={<CloseOutlined />}
              className="mobile-close-button"
              onClick={closeSidebar}
              aria-label="关闭菜单"
            />
          </div>
        </div>
        
        <Menu
          mode="inline"
          selectedKeys={getSelectedKeys()}
          openKeys={openKeys}
          items={menuItems}
          onClick={handleMenuClick}
          onOpenChange={handleOpenChange}
          className="sidebar-menu"
        />

        <div className="sidebar-footer">
          <div className="sidebar-info">
            <p>Powered by ai-wllama</p>
            <p className="version">v1.0.0</p>
            <a
              href="https://github.com/electroluxcode/mvp-ai-wllama"
              target="_blank"
              rel="noopener noreferrer"
              className="github-link"
              title="查看 GitHub 仓库"
            >
              <GithubOutlined /> GitHub
            </a>
            {isMounted && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f0f0f0' }}>
                <ServiceWorkerUninstall />
                <ServiceWorkerManager />
              </div>
            )}
          </div>
        </div>
      </Sider>

      <Layout className="studio-main-content">
        {children}
      </Layout>
    </Layout>
  )
}
