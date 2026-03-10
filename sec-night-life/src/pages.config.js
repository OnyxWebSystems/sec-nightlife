/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import BusinessBookings from './pages/BusinessBookings';
import BusinessDashboard from './pages/BusinessDashboard';
import BusinessEvents from './pages/BusinessEvents';
import BusinessPromotions from './pages/BusinessPromotions';
import ChatRoom from './pages/ChatRoom';
import ChangeEmail from './pages/ChangeEmail';
import ChangePassword from './pages/ChangePassword';
import CreateJob from './pages/CreateJob';
import CreateTable from './pages/CreateTable';
import EditProfile from './pages/EditProfile';
import EventDetails from './pages/EventDetails';
import Events from './pages/Events';
import Explore from './pages/Explore';
import FeedbackInsights from './pages/FeedbackInsights';
import Friends from './pages/Friends';
import HelpCenter from './pages/HelpCenter';
import Home from './pages/Home';
import HostDashboard from './pages/HostDashboard';
import JobDetails from './pages/JobDetails';
import Jobs from './pages/Jobs';
import Leaderboard from './pages/Leaderboard';
import Login from './pages/Login';
import Register from './pages/Register';
import ManageTable from './pages/ManageTable';
import Map from './pages/Map';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import Onboarding from './pages/Onboarding';
import ProfileSetup from './pages/ProfileSetup';
import AppPreferences from './pages/AppPreferences';
import Privacy from './pages/Privacy';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import TermsOfService from './pages/TermsOfService';
import TableDetails from './pages/TableDetails';
import TableJoinOnboarding from './pages/TableJoinOnboarding';
import TablePayment from './pages/TablePayment';
import Tables from './pages/Tables';
import TicketSuccess from './pages/TicketSuccess';
import UserProfile from './pages/UserProfile';
import VenueAnalytics from './pages/VenueAnalytics';
import VenueOnboarding from './pages/VenueOnboarding';
import VenueProfile from './pages/VenueProfile';
import __Layout from './Layout.jsx';


export const PAGES = {
    "BusinessBookings": BusinessBookings,
    "BusinessDashboard": BusinessDashboard,
    "BusinessEvents": BusinessEvents,
    "BusinessPromotions": BusinessPromotions,
    "ChatRoom": ChatRoom,
    "ChangeEmail": ChangeEmail,
    "ChangePassword": ChangePassword,
    "CreateJob": CreateJob,
    "CreateTable": CreateTable,
    "EditProfile": EditProfile,
    "EventDetails": EventDetails,
    "Events": Events,
    "Explore": Explore,
    "FeedbackInsights": FeedbackInsights,
    "Friends": Friends,
    "Home": Home,
    "HostDashboard": HostDashboard,
    "JobDetails": JobDetails,
    "Jobs": Jobs,
    "Leaderboard": Leaderboard,
    "Login": Login,
    "Register": Register,
    "ManageTable": ManageTable,
    "Map": Map,
    "Messages": Messages,
    "Notifications": Notifications,
    "Onboarding": Onboarding,
    "ProfileSetup": ProfileSetup,
    "AppPreferences": AppPreferences,
    "Privacy": Privacy,
    "PrivacyPolicy": PrivacyPolicy,
    "Profile": Profile,
    "Settings": Settings,
    "TermsOfService": TermsOfService,
    "TableDetails": TableDetails,
    "TableJoinOnboarding": TableJoinOnboarding,
    "TablePayment": TablePayment,
    "Tables": Tables,
    "TicketSuccess": TicketSuccess,
    "UserProfile": UserProfile,
    "VenueAnalytics": VenueAnalytics,
    "VenueOnboarding": VenueOnboarding,
    "VenueProfile": VenueProfile,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};