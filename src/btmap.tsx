import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/manrope/latin-ext-400.css';
import '@fontsource/manrope/latin-ext-500.css';
import '@fontsource/manrope/latin-ext-600.css';
import '@fontsource/manrope/latin-ext-700.css';
import '@fontsource/manrope/latin-ext-800.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import App from './App';
import './index.css';
class ErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main className="fatal-error"><h1>Nie udało się otworzyć mapy</h1><p>Odśwież stronę, aby spróbować ponownie.</p><button onClick={()=>location.reload()}>Odśwież stronę</button></main>:this.props.children;}
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);

import './workspace.css';
import './filters.css';
import './station.css';
import './pem-reports.css';
import './pem-plans.css';
import './changelog.css';
import './station-submission.css';
import './terrain-profile.css';
import './area-evaluation.css';
import './azimuths.css';
import './stats.css';
