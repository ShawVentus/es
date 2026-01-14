import { Link } from 'react-router-dom';

export default function Home() {
  const features = [
    {
      icon: 'ri-message-3-line',
      title: '数据获取',
      description: '通过AI助手智能获取各类金融时间序列数据，支持股票、汇率、利率等多种数据源',
      link: '/data-acquisition',
      color: 'from-pink-500 to-rose-600'
    },
    {
      icon: 'ri-database-2-line',
      title: '我的数据',
      description: '集中管理所有数据集，查看数据详情，支持数据预览、下载和快速建模',
      link: '/my-data',
      color: 'from-fuchsia-500 to-pink-600'
    },
    {
      icon: 'ri-function-line',
      title: '模型构建',
      description: '提供ARMA、GARCH、VAR等多种时序模型，支持参数配置和自动化建模',
      link: '/model-building',
      color: 'from-rose-500 to-pink-600'
    },
    {
      icon: 'ri-file-chart-line',
      title: '报告分析',
      description: '自动生成学术级分析报告，包含参数估计、模型诊断和预测结果',
      link: '/report-analysis',
      color: 'from-pink-600 to-fuchsia-600'
    }
  ];

  const workflows = [
    {
      step: '01',
      title: '数据获取',
      description: '使用AI助手快速获取所需的金融时间序列数据'
    },
    {
      step: '02',
      title: '数据管理',
      description: '在数据库中查看和管理所有数据集'
    },
    {
      step: '03',
      title: '模型构建',
      description: '选择合适的模型类型并配置参数进行建模'
    },
    {
      step: '04',
      title: '结果分析',
      description: '查看详细的分析报告和预测结果'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-rose-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-pink-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-10 h-10 object-contain"
              />
              <span className="text-xl font-semibold text-gray-900">金融时序研究平台</span>
            </div>
            <Link
              to="/data-acquisition"
              className="px-5 py-2.5 bg-pink-600 text-white text-sm font-medium rounded-lg hover:bg-pink-700 flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              开始使用
              <i className="ri-arrow-right-line text-lg"></i>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-rose-500/10 to-fuchsia-500/10"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
              专业的金融时间序列
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-rose-600">
                计量经济学研究平台
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed">
              为科研人员提供从数据获取、清洗预处理、特征分析，到建模优化、结果输出、
              <br />
              模型诊断与稳健性评估的全流程智能化研究工具
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                to="/data-acquisition"
                className="px-8 py-4 bg-pink-600 text-white text-base font-semibold rounded-lg hover:bg-pink-700 flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-lg shadow-pink-600/30"
              >
                <i className="ri-rocket-line text-xl"></i>
                立即开始研究
              </Link>
              <a
                href="#features"
                className="px-8 py-4 bg-white text-gray-900 text-base font-semibold rounded-lg hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap cursor-pointer border border-gray-200"
              >
                <i className="ri-play-circle-line text-xl"></i>
                了解更多
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">核心功能模块</h2>
            <p className="text-lg text-gray-600">覆盖金融时序研究的全流程，提供专业的计量经济学分析工具</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <Link
                key={index}
                to={feature.link}
                className="group bg-white rounded-2xl border border-gray-200 p-8 hover:border-pink-300 hover:shadow-xl transition-all cursor-pointer"
              >
                <div className="flex items-start gap-5">
                  <div className={`w-14 h-14 flex items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} flex-shrink-0 group-hover:scale-110 transition-transform`}>
                    <i className={`${feature.icon} text-white text-2xl`}></i>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3 group-hover:text-pink-600 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed mb-4">
                      {feature.description}
                    </p>
                    <div className="flex items-center gap-2 text-pink-600 font-medium text-sm">
                      <span className="whitespace-nowrap">进入模块</span>
                      <i className="ri-arrow-right-line text-lg group-hover:translate-x-1 transition-transform"></i>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">研究工作流程</h2>
            <p className="text-lg text-gray-600">四步完成从数据到结果的完整研究流程</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {workflows.map((workflow, index) => (
              <div key={index} className="relative">
                <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-xl border border-pink-200 p-6 h-full">
                  <div className="text-5xl font-bold text-pink-600/20 mb-4">{workflow.step}</div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">{workflow.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{workflow.description}</p>
                </div>
                {index < workflows.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                    <i className="ri-arrow-right-line text-2xl text-pink-600"></i>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Models Section */}
      <section className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">支持的模型类型</h2>
            <p className="text-lg text-gray-600">涵盖主流时间序列计量经济学模型</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {['ARMA', 'ARIMA', 'GARCH', 'ARCH', 'VAR', 'VECM'].map((model, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-gray-200 p-6 text-center hover:border-pink-300 hover:shadow-lg transition-all cursor-pointer"
              >
                <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-rose-600 mx-auto mb-3">
                  <i className="ri-function-line text-white text-2xl"></i>
                </div>
                <h3 className="text-base font-semibold text-gray-900">{model}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-pink-600 to-rose-600 rounded-2xl p-12 text-center text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-white/10"></div>
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-4">开始您的研究之旅</h2>
              <p className="text-lg text-pink-50 mb-8">
                立即使用我们的平台，让金融时间序列研究更加高效和专业
              </p>
              <Link
                to="/data-acquisition"
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-pink-600 text-base font-semibold rounded-lg hover:bg-gray-50 whitespace-nowrap cursor-pointer shadow-xl"
              >
                <i className="ri-rocket-line text-xl"></i>
                开始使用平台
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-pink-200 py-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img 
                src="/logo.png" 
                alt="Logo" 
                className="w-8 h-8 object-contain"
              />
              <span className="text-sm text-gray-600">© 2026 金融时序研究平台. All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
