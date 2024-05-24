import React, { useState } from "react"

interface TabProps {
  label: string
  active: boolean
  onClick: () => void
}

const Tab: React.FC<TabProps> = ({ label, active, onClick }) => {
  return (
    <button className={`tab ${active ? "active" : ""}`} onClick={onClick}>
      {label}
    </button>
  )
}

interface TabContentProps {
  children: React.ReactNode
  active: boolean
}

const TabContent: React.FC<TabContentProps> = ({ children, active }) => {
  return (
    <div className={`tab-content ${active ? "active" : ""}`}>{children}</div>
  )
}

interface TabData {
  label: string
  content: React.ReactNode
}

interface TabContainerProps {
  tabs: TabData[]
}

const TabContainer: React.FC<TabContainerProps> = ({ tabs }) => {
  const [activeTab, setActiveTab] = useState(0)

  const handleTabClick = (index: number) => {
    setActiveTab(index)
  }

  return (
    <div className="tab-container">
      <div className="tab-header">
        {tabs.map((tab, index) => (
          <Tab
            key={index}
            label={tab.label}
            active={activeTab === index}
            onClick={() => handleTabClick(index)}
          />
        ))}
      </div>
      {tabs.map(
        (tab, index) =>
          activeTab === index && (
            <TabContent key={index} active={activeTab === index}>
              {tab.content}
            </TabContent>
          ),
      )}
    </div>
  )
}

export default TabContainer
